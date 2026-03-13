const path = require('path');
const fs = require('fs');
const { isAdmin } = require('./lib/auth');
const config = require('./dbConfig');

// ---------- image helpers ----------

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);
const MAX_IMAGE_DIMENSION = 1000;

function isImageFile(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

async function optimizeImage(buffer, filename) {
  try {
    const sharp = require('sharp');
    const ext = path.extname(String(filename || '')).toLowerCase();
    let pipeline = sharp(buffer).resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
    if (ext === '.png') {
      pipeline = pipeline.png({ compressionLevel: 8 });
    } else if (ext === '.webp') {
      pipeline = pipeline.webp({ quality: 85 });
    } else {
      pipeline = pipeline.jpeg({ quality: 85, progressive: true });
    }
    return await pipeline.toBuffer();
  } catch (_err) {
    return buffer;
  }
}

// ---------- helpers ----------

const normalizeSegment = (value) =>
  String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const safeFilename = (name) => {
  const base = path.basename(String(name || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

// ---------- local storage ----------

async function saveBufferToLocal(buffer, relativePath) {
  const storageRoot = config.storageRoot;
  const localPath = path.join(storageRoot, relativePath);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, buffer);
  const appBaseUrl = String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${appBaseUrl}/storage/${relativePath}`;
}

// ---------- in-process chunk store ----------
// On a persistent server process this works reliably for sequential uploads.
// Each upload session gets a unique uploadId.
// Chunks are evicted after CHUNK_TTL_MS to avoid leaking memory on failures.

const CHUNK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const chunkStore = new Map(); // uploadId -> { chunks: Buffer[], lastSeen: number, meta }

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of chunkStore) {
    if (now - session.lastSeen > CHUNK_TTL_MS) chunkStore.delete(id);
  }
}

// ---------- handler ----------

exports.handler = async (event) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed', requestId });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'Invalid JSON body', requestId });
  }

  // Auth: accept admin token (preferred) or legacy PIN (fallback)
  const tokenOk = isAdmin(event);
  const legacyPin = process.env.ADMIN_PIN;
  const pinOk = legacyPin && (body.pinCode || '') === legacyPin;
  if (!tokenOk && !pinOk) {
    return json(401, { message: 'Unauthorized — provide a valid admin token or PIN', requestId });
  }

  const {
    fileName,
    folder = 'misc',
    contentBase64,      // non-chunked (small files / legacy)
    // chunked fields:
    uploadId,           // unique ID for this upload session
    chunkIndex,         // 0-based
    totalChunks,        // total number of chunks
    chunkBase64,        // base64 payload for this chunk
  } = body;

  const safeName = safeFilename(fileName);
  const safeFolder = normalizeSegment(folder) || 'misc';

  // ---- non-chunked path ----
  if (contentBase64 !== undefined) {
    if (!safeName || !contentBase64) {
      return json(400, { message: 'fileName and contentBase64 are required', requestId });
    }
    let buffer = Buffer.from(contentBase64, 'base64');
    if (!buffer.length) return json(400, { message: 'Decoded file is empty', requestId });

    if (isImageFile(safeName)) {
      buffer = await optimizeImage(buffer, safeName);
    }

    const stamp = Date.now();
    const relativePath = `uploads/${safeFolder}/${stamp}-${safeName}`;

    try {
      const publicUrl = await saveBufferToLocal(buffer, relativePath);
      return json(200, { message: 'Upload complete', url: publicUrl, bytes: buffer.length, requestId });
    } catch (err) {
      console.error('Upload failed', { requestId, error: err.message });
      return json(500, { message: 'Upload failed', detail: err.message, requestId });
    }
  }

  // ---- chunked path ----
  if (!uploadId || chunkIndex === undefined || totalChunks === undefined || !chunkBase64) {
    return json(400, {
      message: 'For chunked uploads supply: uploadId, chunkIndex, totalChunks, chunkBase64',
      requestId,
    });
  }

  pruneExpired();

  const chunkBuffer = Buffer.from(chunkBase64, 'base64');

  if (!chunkStore.has(uploadId)) {
    chunkStore.set(uploadId, {
      chunks: new Array(totalChunks).fill(null),
      lastSeen: Date.now(),
      meta: { safeName, safeFolder, totalChunks },
    });
  }

  const session = chunkStore.get(uploadId);
  session.chunks[chunkIndex] = chunkBuffer;
  session.lastSeen = Date.now();

  const received = session.chunks.filter(Boolean).length;
  const isComplete = received === totalChunks;

  if (!isComplete) {
    return json(200, {
      message: 'Chunk received',
      chunkIndex,
      received,
      totalChunks,
      requestId,
    });
  }

  // All chunks in — assemble and save
  chunkStore.delete(uploadId);
  let assembled = Buffer.concat(session.chunks);

  if (isImageFile(safeName)) {
    assembled = await optimizeImage(assembled, safeName);
  }

  const stamp = Date.now();
  const relativePath = `uploads/${safeFolder}/${stamp}-${safeName}`;

  try {
    const publicUrl = await saveBufferToLocal(assembled, relativePath);
    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: assembled.length,
      requestId,
    });
  } catch (err) {
    console.error('Chunked upload failed at save stage', { requestId, error: err.message });
    return json(500, { message: 'Upload failed', detail: err.message, requestId });
  }
};
