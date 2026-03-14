/**
 * Netlify Blobs storage backend.
 *
 * Used automatically when the NETLIFY environment variable is present
 * (Netlify sets this on all their runtimes). Requires no credentials —
 * the platform injects everything needed via NETLIFY_BLOBS_CONTEXT.
 *
 * Replaces the FTP backend for Netlify deployments.
 */

const NETLIFY_AVAILABLE = Boolean(process.env.NETLIFY);

const STORE_NAME = 'media';
const TRACKS_KEY = 'metadata/tracks.json';
const SETTINGS_KEY = 'metadata/site-settings.json';

let _store = null;

function getStore() {
  if (_store) return _store;
  const { getStore } = require('@netlify/blobs');
  _store = getStore(STORE_NAME);
  return _store;
}

// ── JSON (metadata) ──────────────────────────────────────────────────────────

async function readJson(key, defaultValue) {
  try {
    const store = getStore();
    const text = await store.get(key, { type: 'text' });
    if (text == null) return defaultValue;
    return JSON.parse(text);
  } catch (err) {
    // 404 / missing key — return default
    if (err?.status === 404 || err?.code === 'BlobNotFound') return defaultValue;
    throw err;
  }
}

async function writeJson(key, value) {
  const store = getStore();
  await store.set(key, JSON.stringify(value, null, 2));
}

// ── Binary files (audio, artwork) ────────────────────────────────────────────

/**
 * Upload a Buffer to Netlify Blobs and return the public CDN URL.
 *
 * @param {string} key        Storage key, e.g. 'audio/uploads/1234-track.mp3'
 * @param {Buffer} buffer     File data
 * @returns {Promise<string>} Public CDN URL
 */
async function uploadFile(key, buffer) {
  const store = getStore();
  await store.set(key, buffer);
  return store.getPublicUrl(key);
}

module.exports = {
  NETLIFY_AVAILABLE,
  TRACKS_KEY,
  SETTINGS_KEY,
  readJson,
  writeJson,
  uploadFile,
};
