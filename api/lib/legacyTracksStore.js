const fs = require('fs');
const path = require('path');
const config = require('../dbConfig');

const getFileJsonPath = () =>
  process.env.TRACKS_JSON_PATH ||
  path.join(config.storageRoot, 'metadata', 'tracks.json');

const readFromFile = async () => {
  const filePath = getFileJsonPath();
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const writeToFile = async (tracks) => {
  const filePath = getFileJsonPath();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(tracks, null, 2));
  return { store: 'file-json', path: filePath };
};

// Default 30 s in-memory TTL.
const cacheTtlMs = Number(process.env.LEGACY_TRACK_CACHE_TTL_MS || 30000);
let trackCache = { tracks: null, store: null, loadedAt: 0 };

const getCachedTracks = () => {
  if (!Array.isArray(trackCache.tracks)) return null;
  if (Date.now() - trackCache.loadedAt > cacheTtlMs) return null;
  return { tracks: trackCache.tracks.map((track) => ({ ...track })), store: trackCache.store };
};

const setCachedTracks = (tracks, store) => {
  trackCache = {
    tracks: Array.isArray(tracks) ? tracks.map((track) => ({ ...track })) : null,
    store,
    loadedAt: Date.now(),
  };
};

const clearCachedTracks = () => {
  trackCache = { tracks: null, store: null, loadedAt: 0 };
};

const loadTracks = async () => {
  const cached = getCachedTracks();
  if (cached) return cached;

  const tracks = await readFromFile();
  setCachedTracks(tracks, 'file-json');
  return { tracks, store: 'file-json' };
};

const saveTracks = async (tracks) => {
  clearCachedTracks();
  const result = await writeToFile(tracks);
  setCachedTracks(tracks, 'file-json');
  return result;
};

const generateTrackId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const withTrackIds = (tracks = []) => {
  let changed = false;
  const normalized = tracks.map((track) => {
    if (track?._id) return track;
    changed = true;
    return { ...track, _id: generateTrackId() };
  });
  return { tracks: normalized, changed };
};

module.exports = {
  loadTracks,
  saveTracks,
  withTrackIds,
};
