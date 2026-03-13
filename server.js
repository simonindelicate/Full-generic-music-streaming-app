'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(__dirname, 'storage');

// ── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Static files ────────────────────────────────────────────────────────────
// Frontend
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    const name = path.basename(filePath);
    if (name === 'player.html' || name === 'welcome-config.json') {
      res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    } else if (name === 'service-worker.js') {
      res.set('Cache-Control', 'no-store');
    }
  },
}));

// Uploaded media & metadata (uploads dir is public; metadata dir is not exposed)
app.use('/storage/uploads', express.static(path.join(STORAGE_ROOT, 'uploads')));

// ── Adapter: Netlify function format → Express ──────────────────────────────
// All api/* handlers export `exports.handler = async (event, context) => {...}`
// and return `{ statusCode, headers, body }`. This shim bridges the two worlds
// so those files need zero changes.
function netlifyHandler(handler) {
  return async (req, res) => {
    // Re-serialise the already-parsed body so handlers that call
    // JSON.parse(event.body) keep working without modification.
    let bodyStr;
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      bodyStr = JSON.stringify(req.body);
    } else if (typeof req.body === 'string') {
      bodyStr = req.body;
    } else {
      bodyStr = '';
    }

    const event = {
      httpMethod: req.method,
      path: req.path,
      rawUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      headers: req.headers,
      queryStringParameters: req.query || {},
      body: bodyStr,
      isBase64Encoded: false,
    };

    try {
      const result = await handler(event, {});
      const status = result.statusCode || 200;
      if (result.headers) res.set(result.headers);
      res.status(status).send(result.body || '');
    } catch (err) {
      console.error('Handler error:', err);
      res.status(500).json({ message: 'Internal server error', detail: err.message });
    }
  };
}

// ── Load API handlers ────────────────────────────────────────────────────────
const siteSettings    = require('./api/siteSettings');
const uploadMedia     = require('./api/uploadMedia');
const resizeArtwork   = require('./api/resizeArtwork');
const scanFolder      = require('./api/scanFolder');
const catalogue       = require('./api/catalogue');
const stream          = require('./api/stream');
const makeSharePage   = require('./api/makeSharePage');
const pwaManifest     = require('./api/pwaManifest');
const upload          = require('./api/upload');
const paymentConfig   = require('./api/paymentConfig');
const paypalCreate    = require('./api/paypalCreateOrder');
const paypalWebhook   = require('./api/paypalWebhook');
const verifyPayment   = require('./api/verifyPayment');
const proxyImage      = require('./api/proxyImage');
const getTrackMeta    = require('./api/getTrackMetadata');
const v1Artists       = require('./api/v1-artists');
const v1Releases      = require('./api/v1-releases');
const v1Tracks        = require('./api/v1-tracks');
const v1Stream        = require('./api/v1-stream');
const v1Instance      = require('./api/v1-instance');

// ── Route helper ─────────────────────────────────────────────────────────────
// Register a handler at both the clean URL and the legacy Netlify path so the
// existing frontend JS works without modification.
function mount(app, cleanPath, handler, methods = ['GET', 'POST']) {
  const h = netlifyHandler(handler);
  const netlifyPath = `/.netlify/functions/${path.basename(cleanPath)}`;
  for (const method of methods) {
    const m = method.toLowerCase();
    app[m](cleanPath, h);
    if (cleanPath !== netlifyPath) app[m](netlifyPath, h);
  }
}

// ── Routes ───────────────────────────────────────────────────────────────────

// Root redirect
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'player.html')));

// PWA manifest
app.get('/manifest.webmanifest', netlifyHandler(pwaManifest.handler));
app.get('/.netlify/functions/pwaManifest', netlifyHandler(pwaManifest.handler));

// Site settings (GET + POST)
mount(app, '/siteSettings', siteSettings.handler);

// Media upload (POST only)
mount(app, '/uploadMedia', uploadMedia.handler, ['POST']);
mount(app, '/upload', upload.handler, ['POST']);

// Artwork resize (POST only)
mount(app, '/resizeArtwork', resizeArtwork.handler, ['POST']);

// Scan public HTTP folder listing (GET)
mount(app, '/scanFolder', scanFolder.handler, ['GET']);

// Public catalogue feed
app.get('/catalogue', netlifyHandler(catalogue.handler));
app.get('/.netlify/functions/catalogue', netlifyHandler(catalogue.handler));

// Audio stream (redirect)
app.get('/stream', netlifyHandler(stream.handler));
app.get('/.netlify/functions/stream', netlifyHandler(stream.handler));

// Track metadata
mount(app, '/getTrackMetadata', getTrackMeta.handler, ['GET']);

// Proxy image
mount(app, '/proxyImage', proxyImage.handler, ['GET']);

// Payment
mount(app, '/paymentConfig', paymentConfig.handler, ['GET']);
mount(app, '/paypalCreateOrder', paypalCreate.handler, ['POST']);
mount(app, '/paypalWebhook', paypalWebhook.handler, ['POST']);
mount(app, '/verifyPayment', verifyPayment.handler, ['GET', 'POST']);

// v1 API
mount(app, '/api/v1/instance', v1Instance.handler, ['GET']);
mount(app, '/api/v1/artists', v1Artists.handler, ['GET']);
mount(app, '/api/v1/releases', v1Releases.handler, ['GET']);
mount(app, '/api/v1/tracks', v1Tracks.handler, ['GET']);
mount(app, '/api/v1/stream', v1Stream.handler, ['GET']);
// Also support legacy /.netlify/functions paths for v1 endpoints
app.get('/.netlify/functions/v1-instance', netlifyHandler(v1Instance.handler));
app.get('/.netlify/functions/v1-artists', netlifyHandler(v1Artists.handler));
app.get('/.netlify/functions/v1-releases', netlifyHandler(v1Releases.handler));
app.get('/.netlify/functions/v1-tracks', netlifyHandler(v1Tracks.handler));
app.get('/.netlify/functions/v1-stream', netlifyHandler(v1Stream.handler));

// Share pages — these must come after other routes
app.get('/album/:albumId', netlifyHandler(makeSharePage.handler));
app.get('/album/:albumId/track/:trackId', netlifyHandler(makeSharePage.handler));
app.get('/track/:trackId', netlifyHandler(makeSharePage.handler));
app.get('/track/:trackId/:slug', netlifyHandler(makeSharePage.handler));
app.get('/.netlify/functions/makeSharePage', netlifyHandler(makeSharePage.handler));

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  const html404 = path.join(__dirname, 'public', '404.html');
  if (fs.existsSync(html404)) return res.status(404).sendFile(html404);
  res.status(404).send('Not found');
});

// ── Start ────────────────────────────────────────────────────────────────────
// Ensure storage directories exist
fs.mkdirSync(path.join(STORAGE_ROOT, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(STORAGE_ROOT, 'metadata'), { recursive: true });

app.listen(PORT, () => {
  console.log(`Music streaming server running on port ${PORT}`);
  console.log(`Storage root: ${STORAGE_ROOT}`);
  console.log(`Open: http://localhost:${PORT}`);
});
