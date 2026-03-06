const { loadTracks } = require('./lib/legacyTracksStore');
const { json } = require('./lib/http');

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { message: 'Method not allowed' });

  const trackId = event.queryStringParameters?.trackId;
  if (!trackId) return json(400, { message: 'trackId is required' });

  const { tracks } = await loadTracks();
  const track = tracks.find((t) => String(t._id || '').trim() === trackId);

  if (!track || track.published === false) return json(404, { message: 'Track not found' });
  if (track.paid === true) return json(403, { message: 'Purchase required' });
  if (!track.mp3Url) return json(404, { message: 'Audio not available' });

  return {
    statusCode: 302,
    headers: {
      Location: track.mp3Url,
      'Cache-Control': 'private, no-store',
    },
    body: '',
  };
};
