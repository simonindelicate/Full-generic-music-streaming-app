const { MongoClient } = require('mongodb');
const config = require('./dbConfig');

const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });

exports.handler = async (event, context) => {
  try {
    await client.connect();
    const db = client.db(config.databaseName);
    const tracksCollection = db.collection(config.collectionName);

    const unpublishedAlbums = await tracksCollection.distinct('albumName', { published: false });
    const albumNames = await tracksCollection.distinct('albumName', { albumName: { $nin: unpublishedAlbums } });

    const albums = await Promise.all(
      albumNames.map(async albumName => {
        const track = await tracksCollection.findOne(
          { albumName, published: { $ne: false } },
          { sort: { trackNumber: 1 } }
        );
        if (track) {
          return {
            albumName,
            artworkUrl: track.artworkUrl,
            albumArtworkUrl: track.albumArtworkUrl || track.artworkUrl
          };
        }
        return null;
      })
    );

    const filteredAlbums = albums.filter((album) => album);
    // Define the desired order of certain albums
const desiredOrder = ['The Mechanical Child', 'Arcadia Park', 'Pylon Music'];

// Convert album names to lowercase for case-insensitive comparison
const lowerCaseDesiredOrder = desiredOrder.map(albumName => albumName.toLowerCase());

// Separate the albums into two arrays: those in the desired order and the rest
const albumsInDesiredOrder = filteredAlbums.filter(album => lowerCaseDesiredOrder.includes(album.albumName.toLowerCase()));
const albumsInDefaultOrder = filteredAlbums.filter(album => !lowerCaseDesiredOrder.includes(album.albumName.toLowerCase()));

// Sort the albums in default order by their original order (ascending)
albumsInDefaultOrder.sort((a, b) => a.originalOrder - b.originalOrder);

// Concatenate the albums in the desired order with the albums in default order
const finalAlbums = albumsInDesiredOrder.concat(albumsInDefaultOrder);

// Use the finalAlbums array for further processing or rendering

    await client.close();


return {
  statusCode: 200,
  body: JSON.stringify(finalAlbums),
};
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};