/**
 * resizeArtwork — download an image from a public URL, resize it with Sharp,
 * and save it to local storage.
 *
 * POST body:
 *   { artworkUrl: string, maxDimension?: number }
 *
 * Response:
 *   { url, originalBytes, newBytes, width, height }
 */

const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { isAdmin } = require('./lib/auth');
const config = require('./dbConfig');

const MAX_DIMENSION_DEFAULT = 1000;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif']);

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

// Download a URL into a Buffer (follows up to 3 redirects)
function fetchBuffer(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        req.destroy();
        return resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode} fetching artwork`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout fetching artwork')); });
  });
}

async function resizeBuffer(buffer, filename, maxDimension) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (loadErr) {
    throw new Error('Image processing module (sharp) is not available. Run: npm install sharp');
  }
  const ext = path.extname(String(filename || '')).toLowerCase();

  const meta = await sharp(buffer).metadata();
  const originalWidth = meta.width || 0;
  const originalHeight = meta.height || 0;

  if (originalWidth <= maxDimension && originalHeight <= maxDimension) {
    return { buffer, width: originalWidth, height: originalHeight, skipped: true };
  }

  let pipeline = sharp(buffer).resize(maxDimension, maxDimension, {
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

  const resized = await pipeline.toBuffer({ resolveWithObject: true });
  return {
    buffer: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    skipped: false,
  };
}

async function saveBufferToLocal(buffer, relativePath) {
  const storageRoot = config.storageRoot;
  const localPath = path.join(storageRoot, relativePath);
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  await fs.promises.writeFile(localPath, buffer);
  const appBaseUrl = String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${appBaseUrl}/storage/${relativePath}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed' });
  }

  if (!isAdmin(event)) {
    return json(401, { message: 'Unauthorized' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { message: 'Invalid JSON body' });
  }

  const { artworkUrl, maxDimension = MAX_DIMENSION_DEFAULT } = body;

  if (!artworkUrl || typeof artworkUrl !== 'string') {
    return json(400, { message: 'artworkUrl is required' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(artworkUrl);
  } catch {
    return json(400, { message: 'artworkUrl is not a valid URL' });
  }

  const ext = path.extname(parsedUrl.pathname).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext) && ext !== '') {
    return json(400, { message: `Unsupported image extension: ${ext}` });
  }

  let originalBuffer;
  try {
    originalBuffer = await fetchBuffer(artworkUrl);
  } catch (err) {
    return json(502, { message: `Could not download artwork: ${err.message}` });
  }

  const originalBytes = originalBuffer.length;

  let resizeResult;
  try {
    resizeResult = await resizeBuffer(originalBuffer, parsedUrl.pathname, Number(maxDimension) || MAX_DIMENSION_DEFAULT);
  } catch (err) {
    return json(500, { message: `Resize failed: ${err.message}` });
  }

  if (resizeResult.skipped) {
    return json(200, {
      skipped: true,
      message: `Image is already within ${maxDimension}px — no resize needed.`,
      url: artworkUrl,
      originalBytes,
      newBytes: originalBytes,
      width: resizeResult.width,
      height: resizeResult.height,
    });
  }

  const safeName = path.basename(parsedUrl.pathname).replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamp = Date.now();
  const relativePath = `uploads/artwork/${stamp}-resized-${safeName}`;

  let newUrl;
  try {
    newUrl = await saveBufferToLocal(resizeResult.buffer, relativePath);
  } catch (err) {
    return json(500, { message: `Save failed: ${err.message}` });
  }

  return json(200, {
    skipped: false,
    message: 'Artwork resized and saved.',
    url: newUrl,
    originalBytes,
    newBytes: resizeResult.buffer.length,
    width: resizeResult.width,
    height: resizeResult.height,
  });
};
