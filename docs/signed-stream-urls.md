# Signed, Short-Lived Stream URLs

## Why

Currently `/.netlify/functions/stream` validates the track and returns a 302
redirect to the raw `mp3Url` on the CDN. That URL is visible in browser DevTools
network logs, can be copied and shared, and remains valid indefinitely.

Signed URLs fix this: the redirect destination includes an expiry timestamp and
an HMAC signature. The URL stops working after ~60 seconds. Sharing it or
replaying it from a network log doesn't work. This is what Bandcamp does.

## What to build

### 1. Signing (in the stream function)

```js
const crypto = require('crypto');

function signUrl(rawUrl, secret, ttlSeconds = 60) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${rawUrl}|${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const separator = rawUrl.includes('?') ? '&' : '?';
  return `${rawUrl}${separator}expires=${expires}&sig=${sig}`;
}
```

Call this in `stream.js` instead of redirecting to `track.mp3Url` directly:

```js
const signedUrl = signUrl(track.mp3Url, process.env.STREAM_SIGNING_SECRET);
return { statusCode: 302, headers: { Location: signedUrl, 'Cache-Control': 'private, no-store' }, body: '' };
```

Add `STREAM_SIGNING_SECRET` (any long random string) to your Netlify env vars.

### 2. Validation

This is the harder part — something has to reject requests with an invalid or
expired signature *before* serving the file. Options:

**Option A — Netlify Edge Function (simplest if files are on your own server)**
An edge function intercepts requests to the CDN path, checks `expires` and `sig`,
and returns 403 if invalid. Works well if you control the origin.

**Option B — A proxy function**
Instead of redirecting to the CDN URL at all, pipe the audio through a second
Netlify Function that validates the signed token and streams the bytes. Avoids
needing CDN-layer validation, but reintroduces the buffering/timeout problem for
large files.

**Option C — Cloudflare Workers in front of the FTP host**
Put Cloudflare in front of the FTP public URL, write a Worker that validates the
signature, and block direct access to the origin. Clean separation of concerns,
works well at scale.

## What you need to know first

- What does a `mp3Url` look like? (which host/CDN are the FTP files served from)
- Can you put anything in front of that host to intercept requests?

The signing code (step 1) can be added any time. Step 2 depends on the answer
to those questions.

## Related code

- `api/stream.js` — where the redirect happens, where signing would be added
- `api/lib/legacyTracksStore.js` — where `mp3Url` lives on track objects
