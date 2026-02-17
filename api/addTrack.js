const { MongoClient } = require('mongodb');
const config = require('./dbConfig');
const { fetchTrackDurationSeconds } = require('./audioUtils');

const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect();
const db = client.db(config.databaseName);

const tracksCollection = db.collection(config.collectionName);

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

    for (const track of tracks) {
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
        published: track.published === false ? false : published,
        createdAt: track.createdAt ? new Date(track.createdAt) : new Date(),
      };

      const cleanedDocument = Object.fromEntries(
        Object.entries(document).filter(([_, value]) => value !== undefined && value !== '')
      );

      await tracksCollection.insertOne(cleanedDocument);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Tracks added!' }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: err.message,
    };
  }
};
