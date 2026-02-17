const { MongoClient } = require('mongodb');
const config = require('./dbConfig');

exports.handler = async (event, context) => {
  const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    const db = client.db(config.databaseName);
    const tracksCollection = db.collection(config.collectionName);

    const tracks = await tracksCollection.find().toArray();

    // Close the database connection
    await client.close();

    return {
      statusCode: 200,
      body: JSON.stringify(tracks),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};