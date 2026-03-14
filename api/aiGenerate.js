/**
 * AI Music Generation Plugin — Netlify Function
 *
 * Plugin file: drop api/aiGenerate.js into any instance of this app.
 * Requires REPLICATE_API_TOKEN set as a Netlify environment variable.
 *
 * POST /.netlify/functions/aiGenerate
 *   Body: { prompt, duration?, modelVersion? }
 *   Returns: { predictionId, status }
 *
 * GET /.netlify/functions/aiGenerate?id=<predictionId>
 *   Returns: { status, audioUrl, error }
 */

const { isAdmin } = require('./lib/auth');
const fetch = require('node-fetch');

const REPLICATE_API = 'https://api.replicate.com/v1';

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function replicateRequest(path, method, body) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN environment variable is not set in Netlify');

  const opts = {
    method: method || 'GET',
    headers: {
      Authorization: `Token ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${REPLICATE_API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || `Replicate API error ${res.status}`);
  return data;
}

exports.handler = async (event) => {
  if (!isAdmin(event)) return json(401, { message: 'Unauthorized' });

  try {
    // POST — start a new prediction
    if (event.httpMethod === 'POST') {
      const { prompt, duration = 8, modelVersion = 'stereo-large' } = JSON.parse(event.body || '{}');
      if (!prompt || !prompt.trim()) return json(400, { message: 'prompt is required' });

      const clampedDuration = Math.min(Math.max(parseInt(duration, 10) || 8, 1), 30);

      const prediction = await replicateRequest('/models/meta/musicgen/predictions', 'POST', {
        input: {
          prompt: prompt.trim(),
          duration: clampedDuration,
          model_version: modelVersion,
          output_format: 'mp3',
          normalization_strategy: 'peak',
        },
      });

      return json(200, { predictionId: prediction.id, status: prediction.status });
    }

    // GET — poll an existing prediction
    if (event.httpMethod === 'GET') {
      const id = (event.queryStringParameters || {}).id;
      if (!id) return json(400, { message: 'id query parameter is required' });

      const prediction = await replicateRequest(`/predictions/${id}`);

      return json(200, {
        status: prediction.status,
        audioUrl: prediction.status === 'succeeded' ? prediction.output : null,
        error: prediction.error || null,
      });
    }

    return json(405, { message: 'Method not allowed' });
  } catch (err) {
    return json(500, { message: err.message });
  }
};
