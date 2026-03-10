# Full Generic Music Streaming App

A self-hosted music streaming site built for Netlify. Upload your music, configure your branding, optionally gate tracks behind a PayPal payment — no database required.

---

## What it does

- **Music player** — album gallery, track list, seek bar, shuffle/repeat, media keys, dynamic artwork-based theming, shareable track/album URLs
- **Admin UI** — web-based track upload, metadata editing, artwork management, site settings
- **Payment gating** — mark individual tracks as paid; buyers verify via PayPal and get a signed access token stored in their browser
- **No mandatory database** — tracks and settings live in a JSON file on FTP (or local disk). MongoDB is not required for any part of this

---

## Prerequisites

- A [Netlify](https://netlify.com) account (free tier is fine)
- An FTP server with a publicly accessible URL for media files
  - Any standard web host with FTP access works
  - The public URL is where your MP3s and images will be served from
- For payments: a [PayPal Developer](https://developer.paypal.com) account

---

## Setup: no payments

This gets you a fully working player with admin upload in about 5 minutes.

### 1. Deploy to Netlify

Fork or clone this repo, then connect it to Netlify. The `netlify.toml` handles everything:

- Publish directory: `public/`
- Functions directory: `api/`

### 2. Set environment variables

In your Netlify dashboard → **Site configuration → Environment variables**, add:

| Variable | Required | Description |
|---|---|---|
| `APP_BASE_URL` | Yes | Your Netlify site URL, e.g. `https://your-site.netlify.app` |
| `ADMIN_API_TOKEN` | Yes | A secret password for the admin UI — make it long and random |
| `FTP_HOST` | Yes | Your FTP server hostname |
| `FTP_USER` | Yes | FTP username |
| `FTP_PASSWORD` | Yes | FTP password |
| `FTP_PUBLIC_BASE_URL` | Yes | The public HTTP URL for files on that FTP server, e.g. `https://media.yourdomain.com` |
| `FTP_BASE_PATH` | No | Upload folder on FTP (default: `uploads`) |
| `FTP_SECURE` | No | Set to `true` for SFTP/FTPS |

Trigger a redeploy after saving.

### 3. Upload your first track

Go to `https://your-site.netlify.app/insert.html`, log in with your `ADMIN_API_TOKEN`, and upload a track. Then visit `/player.html` to confirm it plays.

That's it for a basic setup. The setup wizard at `/install.html` walks through the same steps with copy-paste helpers.

---

## Setup: with payment gating

### 1. Complete the basic setup above

### 2. Generate a payment secret

`PAYMENT_SECRET` is a random string used to sign access tokens. Nothing to register — just generate one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add it to Netlify environment variables:

| Variable | Description |
|---|---|
| `PAYMENT_SECRET` | The random string you generated |

### 3. Create a PayPal app

1. Go to [developer.paypal.com](https://developer.paypal.com) → **Apps & Credentials**
2. Click **Create App**
3. Choose **Merchant** type, give it a name
4. Copy the **Client ID** and **Secret** (use Sandbox credentials for testing, Live for production)

Add to Netlify:

| Variable | Description |
|---|---|
| `PAYPAL_CLIENT_ID` | From your PayPal app |
| `PAYPAL_CLIENT_SECRET` | From your PayPal app |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` for testing, `https://api-m.paypal.com` for production |

### 4. Configure your PayPal return URL

Wherever your PayPal button or checkout lives, set the **return URL** (also called the success/redirect URL) to:

```
https://your-site.netlify.app/support.html
```

PayPal will append `?token=ORDER_ID&PayerID=PAYER_ID` (for one-time purchases) or `?subscription_id=SUB_ID` (for subscriptions) to that URL. The page detects these parameters automatically, verifies the payment with PayPal, and activates access in the buyer's browser.

**For subscriptions,** also set the **cancel URL** to wherever you want cancelled users to land.

### 5. Configure the support page

In the admin settings (`/admin-settings.html`), fill in the support page fields:

- **Support embed URL** — the PayPal button embed URL, or a link to your PayPal checkout page
- **Primary store link** — your external store URL (Bandcamp, Shopify, etc.) if applicable

### 6. Mark tracks as paid

In the track editor (`/edit.html`), toggle the **Paid** flag on any tracks that require purchase. Paid tracks will show a lock icon in the player and prompt unpaid listeners to visit the support page.

Redeploy after adding environment variables.

---

## How payment access works

When a buyer completes payment, PayPal redirects them to `/support.html` with an order or subscription ID in the URL. The page:

1. Calls `/.netlify/functions/verifyPayment` with that ID
2. The function verifies the payment directly with PayPal's API (no database involved)
3. Issues a signed access token (HMAC-SHA256, signed with `PAYMENT_SECRET`)
4. The token is stored in **both localStorage and a 1-year cookie** — so if localStorage is cleared, the cookie is the fallback

When playing a paid track, the player appends `?accessToken=...` to the stream URL. The stream function verifies the signature server-side before issuing the redirect to the audio file.

**Subscriptions** issue tokens that expire after 1 hour. The page silently refreshes them by re-verifying with PayPal.

**One-time purchases** issue tokens with no expiry.

### If a buyer loses access (both storage and cookie cleared)

The **"Already purchased? Restore access"** section at the bottom of `/support.html` lets them paste their PayPal Order ID or Subscription ID to re-issue a token. The ID is in their PayPal receipt email.

---

## All environment variables

### Required (always)

| Variable | Description |
|---|---|
| `APP_BASE_URL` | Full URL of your Netlify site |
| `ADMIN_API_TOKEN` | Admin password — protects all write operations |
| `FTP_HOST` | FTP server hostname |
| `FTP_USER` | FTP username |
| `FTP_PASSWORD` | FTP password |
| `FTP_PUBLIC_BASE_URL` | Public HTTP base URL for FTP-hosted files |

### FTP (optional)

| Variable | Default | Description |
|---|---|---|
| `FTP_BASE_PATH` | `uploads` | Base folder for uploads on FTP |
| `FTP_SECURE` | `false` | Set `true` for SFTP/FTPS |
| `TRACKS_JSON_REMOTE_PATH` | `metadata/tracks.json` | Path to tracks file within `FTP_BASE_PATH` |
| `SITE_SETTINGS_REMOTE_PATH` | `metadata/site-settings.json` | Path to settings file within `FTP_BASE_PATH` |

### Storage backend

| Variable | Default | Description |
|---|---|---|
| `LEGACY_TRACK_STORE` | `auto` | `auto` (prefers FTP if configured, else local file), `ftp-json`, or `file-json` |
| `TRACKS_JSON_PATH` | `storage/metadata/tracks.json` | Local file path when using `file-json` |
| `SITE_SETTINGS_PATH` | `storage/metadata/site-settings.json` | Local file path for settings when using `file-json` |
| `STORAGE_ROOT` | `./storage` | Root for local file storage |
| `LEGACY_TRACK_CACHE_TTL_MS` | `30000` | In-memory track cache TTL in milliseconds |

### Payments (optional)

| Variable | Description |
|---|---|
| `PAYMENT_SECRET` | Random string for signing access tokens — required if using paid tracks |
| `PAYPAL_CLIENT_ID` | PayPal app client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal app secret |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` (sandbox) or `https://api-m.paypal.com` (live) |
| `PAYPAL_WEBHOOK_ID` | Optional — only needed if using the PayPal webhook endpoint |

### Miscellaneous

| Variable | Default | Description |
|---|---|---|
| `DISCOVERY_OPT_IN` | — | Set `true` to allow your catalogue to appear in public discovery APIs |
| `INSTANCE_ID` | `local-instance` | Identifier for this instance in discovery feeds |

---

## Admin pages

All admin pages require your `ADMIN_API_TOKEN`. Log in at `/admin/admin-login.html`.

| Page | Purpose |
|---|---|
| `/insert.html` | Upload new tracks — supports drag-and-drop, folder scan, URL paste, chunked upload for large files |
| `/edit.html` | Edit track metadata, set paid/published/favourite flags, delete tracks |
| `/edit-albums.html` | Edit album metadata, sort order, publish/unpublish whole albums |
| `/admin-settings.html` | Branding, colours, fonts, welcome text, support page, footer |
| `/admin-artwork.html` | Upload and manage album artwork |
| `/admin/admin-pseudo-albums.html` | Create virtual albums (e.g. "All tracks shuffle", custom collections) |
| `/install.html` | First-time setup wizard with copy-paste env variable helpers |

---

## Track data format

Tracks are stored as a JSON array. Each track:

```json
{
  "_id": "1714000000000-abc123",
  "trackName": "Song Title",
  "albumName": "Album Name",
  "albumId": "album-name",
  "artistName": "Artist Name",
  "mp3Url": "https://media.yourdomain.com/uploads/song.mp3",
  "artworkUrl": "https://media.yourdomain.com/uploads/cover.jpg",
  "trackNumber": 1,
  "durationSeconds": 240,
  "genre": "Folk",
  "year": 2024,
  "paid": false,
  "published": true
}
```

Set `"paid": true` to gate a track behind payment. Set `"published": false` to hide it entirely.

---

## FTP directory structure

```
FTP_BASE_PATH/                     (default: uploads/)
├── metadata/
│   ├── tracks.json                ← all track data
│   └── site-settings.json        ← branding and settings
├── artwork/
│   └── cover-image.jpg
└── 1714000000000-song.mp3
```

---

## Share URLs

The following URLs are handled automatically:

| URL | Content |
|---|---|
| `/` | Player (gallery view) |
| `/album/:albumId` | Player opened to a specific album |
| `/album/:albumId/track/:trackId` | Player with specific track selected |
| `/track/:trackId` | Player with specific track selected |
| `/track/:trackId/:slug` | Same — slug is decorative for SEO |

All share pages include OpenGraph metadata for link previews.

---

## Local development

```bash
npm install
npx netlify dev
```

- Player: `http://localhost:8888`
- Installer: `http://localhost:8888/install.html`
- Admin: `http://localhost:8888/insert.html`

Create a `.env` file at the project root with your environment variables (the installer at `/install.html` can help generate it).

---

## Switching to production PayPal

1. In your PayPal app, switch from **Sandbox** to **Live** credentials
2. Update `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in Netlify
3. Change `PAYPAL_API_BASE` to `https://api-m.paypal.com`
4. Update your PayPal button/checkout return URL to your live site URL
5. Redeploy

---

## License

MIT

## Author

Simon Indelicate
