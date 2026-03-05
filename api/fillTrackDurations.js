const { MongoClient, ObjectId } = require('mongodb');
const config = require('./dbConfig');
const { fetchBitrate, fetchPartialAudio } = require('./audioUtils');
const { isAdmin } = require('./lib/auth');

// Leave ~6 s headroom against the 30 s Netlify function timeout.
const TIME_BUDGET_MS = 24000;
const CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 9000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ message: 'Method not allowed' }) };
  }

  if (!isAdmin(event)) {
    return { statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const startTime = Date.now();

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

    let processed = 0;
    let updated = 0;
    const failures = [];

    async function processTrack(track) {
      if (!track.mp3Url) {
        failures.push({ id: track._id, trackName: track.trackName, albumName: track.albumName, mp3Url: null, reason: 'No MP3 URL is set for this track' });
        processed += 1;
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let bitrate, totalSize;
      try {
        ({ bitrate, totalSize } = await fetchBitrate(track.mp3Url, controller.signal));
      } catch (err) {
        let reason;
        if (err.name === 'AbortError' || err.name === 'TimeoutError') {
          reason = `Timed out after ${FETCH_TIMEOUT_MS / 1000}s – server is not responding or is too slow`;
        } else {
          const httpMatch = err.message.match(/\((\d{3})\)/);
          if (httpMatch) {
            const code = httpMatch[1];
            if (code === '403') reason = `HTTP 403 – server denied access (check folder permissions / .htaccess)`;
            else if (code === '404') reason = `HTTP 404 – file not found at URL`;
            else if (code === '401') reason = `HTTP 401 – file requires authentication`;
            else reason = `HTTP ${code} – could not download file`;
          } else {
            reason = `Network error: ${err.message}`;
          }
        }
        failures.push({ id: track._id, trackName: track.trackName, albumName: track.albumName, mp3Url: track.mp3Url, reason });
        processed += 1;
        return;
      } finally {
        clearTimeout(timer);
      }

      if (!bitrate) {
        failures.push({ id: track._id, trackName: track.trackName, albumName: track.albumName, mp3Url: track.mp3Url, reason: 'No valid MP3 frame header found – file may not be a standard MP3, or is corrupt' });
        processed += 1;
        return;
      }

      if (!totalSize) {
        failures.push({ id: track._id, trackName: track.trackName, albumName: track.albumName, mp3Url: track.mp3Url, reason: 'File total size unknown – server did not return Content-Range or Content-Length' });
        processed += 1;
        return;
      }

      const durationSeconds = Math.round((totalSize * 8) / (bitrate * 1000));
      if (!durationSeconds) {
        failures.push({ id: track._id, trackName: track.trackName, albumName: track.albumName, mp3Url: track.mp3Url, reason: 'Calculated duration is zero – bitrate or file size may be unreliable' });
        processed += 1;
        return;
      }

      const trackId = typeof track._id === 'string' ? new ObjectId(track._id) : track._id;
      await tracksCollection.updateOne({ _id: trackId }, { $set: { durationSeconds, duration: durationSeconds } });
      updated += 1;
      processed += 1;
    }

    // Process in concurrent batches, stopping before the function timeout.
    for (let i = 0; i < tracks.length; i += CONCURRENCY) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        // Return partial results; UI will call again for the remainder.
        const remaining = tracks.length - i;
        return {
          statusCode: 200,
          body: JSON.stringify({ processed, updated, failures, remaining }),
        };
      }
      await Promise.all(tracks.slice(i, i + CONCURRENCY).map(processTrack));
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ processed, updated, failures, remaining: 0 }),
    };
  } catch (err) {
    console.error('Failed to update track durations', err);
    return { statusCode: 500, body: err.message };
  } finally {
    await client.close();
  }
};
