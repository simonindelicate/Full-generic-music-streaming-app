const { MongoClient, ObjectId } = require('mongodb');
const config = require('./dbConfig');
const { fetchTrackDurationSeconds } = require('./audioUtils');

const clientOptions = { useNewUrlParser: true, useUnifiedTopology: true };

async function getAlbums(collection) {
  const albums = await collection
    .aggregate([
      {
        $group: {
          _id: '$albumName',
          albumName: { $first: '$albumName' },
          albumId: { $first: '$albumId' },
          artistName: { $first: '$artistName' },
          artworkUrl: { $first: '$artworkUrl' },
          albumArtworkUrl: { $first: '$albumArtworkUrl' },
          bgcolor: { $first: '$bgcolor' },
          genre: { $first: '$genre' },
          year: { $first: '$year' },
          published: { $min: { $cond: [{ $eq: ['$published', false] }, 0, 1] } },
          trackCount: { $sum: 1 },
        },
      },
      { $sort: { albumName: 1 } },
    ])
    .toArray();

  return albums.map(album => ({
    ...album,
    published: album.published !== 0,
  }));
}

function buildUpdateDocument(updates = {}) {
  const updateDocument = {};
  const numericFields = new Set(['year']);

  Object.entries(updates).forEach(([key, value]) => {
    if (value === undefined) return;
    if (numericFields.has(key) && value !== '') {
      const numericValue = Number(value);
      updateDocument[key] = Number.isNaN(numericValue) ? value : numericValue;
      return;
    }

    if (key === 'published') {
      updateDocument.published = value === false || value === 'false' ? false : Boolean(value);
      return;
    }

    updateDocument[key] = value;
  });

  return updateDocument;
}

async function populateAlbumDurations(collection, albumName) {
  const tracks = await collection.find({ albumName }).toArray();

  let updated = 0;
  const failures = [];

  for (const track of tracks) {
    if (!track.mp3Url) {
      failures.push({ id: track._id, reason: 'Missing mp3Url' });
      continue;
    }

    try {
      const durationSeconds = await fetchTrackDurationSeconds(track.mp3Url);
      if (!durationSeconds) {
        failures.push({ id: track._id, reason: 'Duration not detected' });
        continue;
      }

      const trackId = typeof track._id === 'string' ? new ObjectId(track._id) : track._id;
      await collection.updateOne(
        { _id: trackId },
        {
          $set: {
            durationSeconds,
            duration: durationSeconds,
          },
        }
      );
      updated += 1;
    } catch (error) {
      failures.push({ id: track._id, reason: error.message });
    }
  }

  return { processed: tracks.length, updated, failures };
}

exports.handler = async (event) => {
  const client = new MongoClient(config.mongodbUri, clientOptions);

  try {
    await client.connect();
    const collection = client.db(config.databaseName).collection(config.collectionName);

    if (event.httpMethod === 'GET') {
      const albums = await getAlbums(collection);
      return {
        statusCode: 200,
        body: JSON.stringify(albums),
      };
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { albumName, updates = {}, populateDurations } = body;

      if (!albumName) {
        return { statusCode: 400, body: JSON.stringify({ message: 'Missing albumName' }) };
      }

      const updateDocument = buildUpdateDocument(updates);
      const response = { albumName };

      if (Object.keys(updateDocument).length > 0) {
        await collection.updateMany({ albumName }, { $set: updateDocument });
        response.updatedFields = Object.keys(updateDocument);
      }

      if (populateDurations) {
        response.durationUpdate = await populateAlbumDurations(collection, albumName);
      }

      if (!response.updatedFields && !response.durationUpdate) {
        return { statusCode: 400, body: JSON.stringify({ message: 'No updates requested' }) };
      }

      return { statusCode: 200, body: JSON.stringify(response) };
    }

    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  } catch (error) {
    console.error('Album edit failed', error);
    return { statusCode: 500, body: error.message };
  } finally {
    await client.close();
  }
};
