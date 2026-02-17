const { MongoClient } = require('mongodb');
const config = require('./dbConfig');
const ObjectId = require('mongodb').ObjectId;
const fs = require('fs');
const path = require('path');

const client = new MongoClient(config.mongodbUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

exports.handler = async (event) => {
  // Connect to database
  const database = (await client.connect()).db(config.databaseName);

  // Get collection
  const collection = database.collection(config.collectionName);

  // GET handler
  if (event.httpMethod === 'GET') {
    // Get id from query params
    const { id } = event.queryStringParameters || {};

    if (id) {
      // Convert to ObjectId
      const trackId = new ObjectId(id);

      // Find track
      const track = await collection.findOne({
        _id: trackId,
      });

      // Return track
      return {
        statusCode: 200,
        body: JSON.stringify(track),
      };
    } else {
      // View all tracks
      const tracks = await collection
        .find({}, { projection: { _id: 1, trackName: 1, albumName: 1, trackNumber: 1, published: 1, artistName: 1 } })
        .toArray();
      return {
        statusCode: 200,
        body: JSON.stringify(tracks),
      };
    }
  }

  // POST handler
  else if (event.httpMethod === 'POST') {
    // Parse request body
    const requestBody = JSON.parse(event.body);

    // Get ID and data
    const { _id, ...data } = requestBody;

    // Convert ID
    const trackId = new ObjectId(_id);

    // Create update document
    const updateDocument = {};
    const numericFields = new Set(['trackNumber', 'playCount', 'durationSeconds', 'duration', 'year']);

    // Loop through data keys
    for (let key in data) {
      if (data[key] === undefined) continue;
      if (numericFields.has(key) && data[key] !== '') {
        const numericValue = Number(data[key]);
        updateDocument[key] = Number.isNaN(numericValue) ? data[key] : numericValue;
      } else if (key === 'published') {
        updateDocument[key] = data[key] === false || data[key] === 'false' ? false : Boolean(data[key]);
      } else if (key === 'fav') {
        updateDocument[key] = data[key] === true || data[key] === 'true';
      } else {
        updateDocument[key] = data[key];
      }
    }

    // Update track
    await collection.updateOne({ _id: trackId }, { $set: updateDocument });

    // Return response
    return {
      statusCode: 200,
      body: 'Track updated!',
    };
  }

  // DELETE handler
  else if (event.httpMethod === 'DELETE') {
    const requestBody = JSON.parse(event.body || '{}');
    const { id } = requestBody;

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing track id' }),
      };
    }

    const trackId = new ObjectId(id);
    const track = await collection.findOne({ _id: trackId });
    await collection.deleteOne({ _id: trackId });

    const mp3Url = track?.mp3Url;
    const isLocalFile = mp3Url && !/^https?:\/\//i.test(mp3Url);
    if (isLocalFile) {
      const targetPath = path.resolve(__dirname, '..', mp3Url.replace(/^\//, ''));
      try {
        const stats = await fs.promises.stat(targetPath);
        if (stats.isFile()) {
          await fs.promises.unlink(targetPath);
        }
      } catch (error) {
        console.warn(`Could not remove local file ${targetPath}:`, error.message);
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Track deleted' }),
    };
  }

  // Close connection
  await client.close();
};
