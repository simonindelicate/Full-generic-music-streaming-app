const { MongoClient, ObjectId } = require('mongodb');
const config = require('./dbConfig');
const { fetchTrackDurationSeconds } = require('./audioUtils');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method not allowed' }),
    };
  }

  const client = new MongoClient(config.mongodbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  try {
    await client.connect();
    const db = client.db(config.databaseName);
    const tracksCollection = db.collection(config.collectionName);

    const missingDurationQuery = {
      $or: [
        { durationSeconds: { $exists: false } },
        { durationSeconds: null },
        { durationSeconds: { $lte: 0 } },
      ],
    };

    const tracks = await tracksCollection.find(missingDurationQuery).toArray();

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

        await tracksCollection.updateOne(
          { _id: trackId },
          {
            $set: {
              durationSeconds,
              duration: durationSeconds,
            },
          }
        );
        updated += 1;
      } catch (err) {
        failures.push({ id: track._id, reason: err.message });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ processed: tracks.length, updated, failures }),
    };
  } catch (err) {
    console.error('Failed to update track durations', err);
    return { statusCode: 500, body: err.message };
  } finally {
    await client.close();
  }
};
