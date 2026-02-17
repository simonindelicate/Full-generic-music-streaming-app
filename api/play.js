const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb'); // Import the ObjectId constructor separately
const config = require('./dbConfig');

const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });

exports.handler = async (event, context) => {
  try {
    await client.connect();
    const db = client.db(config.databaseName);
    const tracksCollection = db.collection(config.collectionName);

    const trackId = event.queryStringParameters.id; // Assuming the track ID is passed as a query parameter in the request

    // Increment the play count for the specified track
    await tracksCollection.updateOne({ _id: new ObjectId(trackId) }, { $inc: { playCount: 1 } });

    // Close the database connection
    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Play count incremented successfully' }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};