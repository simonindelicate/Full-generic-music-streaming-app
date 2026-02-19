const fs = require('fs');
const path = require('path');
const config = require('./dbConfig');
const { fetchTrackDurationSeconds } = require('./audioUtils');

const JSON_TRACKS_PATH = path.join(process.cwd(), 'public', 'tracks.json');

const readJsonTracks = async () => {
  try {
    const content = await fs.promises.readFile(JSON_TRACKS_PATH, 'utf8');
    const parsed = JSON.parse(content || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const writeJsonTracks = async (tracks) => {
  await fs.promises.mkdir(path.dirname(JSON_TRACKS_PATH), { recursive: true });
  await fs.promises.writeFile(JSON_TRACKS_PATH, JSON.stringify(tracks, null, 2));
};

const toTrackDocument = async (album, track, defaultPublished) => {
  let durationSeconds = 0;
  const providedDuration = track.durationSeconds || track.duration;

  if (providedDuration) {
    const parsed = Number(providedDuration);
    durationSeconds = Number.isNaN(parsed) ? 0 : parsed;
  }

  if (!durationSeconds && track.mp3Url) {
    try {
      durationSeconds = await fetchTrackDurationSeconds(track.mp3Url);
    } catch (err) {
      console.error(`Failed to derive duration for ${track.trackName}:`, err.message);
    }
  }

  const document = {
    albumName: album.albumName,
    albumId: album.albumId,
    albumArtworkUrl: album.albumArtworkUrl || album.artworkUrl,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    mp3Url: track.mp3Url,
    trackName: track.trackName,
    trackNumber: Number(track.trackNumber) || track.trackNumber,
    durationSeconds: durationSeconds || undefined,
    duration: durationSeconds || undefined,
    trackMedium: track.trackMedium,
    trackText: track.trackText,
    bgcolor: track.bgcolor || album.bgcolor,
    genre: track.genre || album.genre,
    year: track.year || album.year,
    fav: track.fav === true || track.fav === 'true',
    published: track.published === false ? false : defaultPublished,
    createdAt: track.createdAt ? new Date(track.createdAt) : new Date(),
  };

  return Object.fromEntries(
    Object.entries(document).filter(([_, value]) => value !== undefined && value !== '')
  );
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ message: 'Method not allowed' }),
      };
    }

    const data = JSON.parse(event.body || '{}');
    const album = data.album || {};
    const tracks = data.tracks || [];
    const published = album.published === false || album.published === 'false' ? false : true;

    const trackDocuments = [];
    for (const track of tracks) {
      trackDocuments.push(await toTrackDocument(album, track, published));
    }

    const preferredStore = String(process.env.LEGACY_TRACK_STORE || 'json').toLowerCase();

    if (preferredStore === 'mongodb') {
      const { MongoClient } = require('mongodb');
      const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
      try {
        await client.connect();
        const tracksCollection = client.db(config.databaseName).collection(config.collectionName);
        for (const trackDocument of trackDocuments) {
          await tracksCollection.insertOne(trackDocument);
        }
      } finally {
        await client.close();
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Tracks added!', store: 'mongodb' }),
      };
    }

    const existingTracks = await readJsonTracks();
    const mergedTracks = existingTracks.concat(trackDocuments);
    await writeJsonTracks(mergedTracks);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tracks added!', store: 'json', count: trackDocuments.length }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};
