# Music Streaming Server

Your own music streaming website, running on your own server. Listeners get a proper player with album artwork, shuffle, and shareable links. You get a web-based admin panel to upload tracks, manage metadata, and — if you want — charge a monthly subscription to unlock your catalogue.

**No monthly platform fees. No algorithm. No one can take it down but you.**

This version runs entirely on your own server using Docker. Your music files, metadata, and settings are all stored on your machine — no FTP, no third-party storage.

---

## What you need

- A VPS (Virtual Private Server) or dedicated server running Linux — something like a $6/month Hetzner Cloud, DigitalOcean Droplet, or Linode Nanode is plenty
- SSH access to that server
- A domain name (optional but recommended)

That's it. Docker handles everything else.

> **Don't have a server yet?** Any of these work well and have simple control panels:
> - [Hetzner Cloud](https://www.hetzner.com/cloud) — CX22, about €4/month, excellent value
> - [DigitalOcean](https://www.digitalocean.com) — Basic Droplet, $6/month
> - [Linode/Akamai](https://www.linode.com) — Nanode, $5/month
>
> Choose Ubuntu 22.04 or 24.04 as the operating system when setting up.

---

## Part 1: Installing the app

### Step 1: Install Docker on your server

SSH into your server and run these two commands:

```bash
curl -fsSL https://get.docker.com | sh
```

Then add your user to the docker group so you don't need `sudo` every time:

```bash
sudo usermod -aG docker $USER
```

Log out and back in for that to take effect.

---

### Step 2: Download the app

```bash
git clone https://github.com/YOUR-USERNAME/music-streaming-server.git
cd music-streaming-server
```

(Replace `YOUR-USERNAME/music-streaming-server` with wherever you put this repository.)

---

### Step 3: Create your settings file

Copy the example settings file:

```bash
cp .env.example .env
```

Then open it in a text editor:

```bash
nano .env
```

You'll see this:

```
APP_BASE_URL=http://localhost:3000
PORT=3000
STORAGE_ROOT=./storage
ADMIN_API_TOKEN=
DISCOVERY_OPT_IN=false
...
```

Change these two things now:

**`APP_BASE_URL`** — set this to your server's IP address or domain name, with `http://` or `https://` and no trailing slash.
- If you have a domain: `https://music.yourdomain.com`
- If you're just using an IP address: `http://123.45.67.89`

**`ADMIN_API_TOKEN`** — this is your admin password. Make it long and hard to guess — at least 20 random characters. You can generate one with:

```bash
openssl rand -hex 24
```

Copy the output and paste it as the value. Save the file (`Ctrl+X`, then `Y`, then `Enter` if you're using nano).

---

### Step 4: Start the app

```bash
docker compose up -d
```

That's it. Docker will download everything it needs and start the server. The first run takes a minute or two. After that, it starts in seconds.

To check it's running:

```bash
docker compose ps
```

You should see both `app` and `nginx` listed as running.

---

### Step 5: Open your site

Go to `http://YOUR-SERVER-IP` in a browser (or your domain if you've set up DNS). You should see the music player.

The first time you visit, it'll be empty — that's expected. Head to the next step to add your music.

---

## Part 2: Adding your music

### Log in to the admin panel

Go to: `http://your-server/admin-login.html`

Log in with the `ADMIN_API_TOKEN` you set. You'll be taken to the admin area.

> If you get "Unauthorized", double-check that what you typed exactly matches the token in your `.env` file — it's case-sensitive.

---

### Upload your first track

Go to: `http://your-server/insert.html`

Drag and drop an MP3 file onto the upload area, or click to browse. Fill in the track name, album name, and artist name, then click **Upload**.

Then visit your site's home page — you should see your track in the player.

---

### Personalise your site

Go to: `http://your-server/admin-settings.html`

Here you can set:
- Your site name and artist name
- Logo and favicon
- Colours and fonts
- Welcome message
- About page content
- Footer text

Changes are saved immediately.

---

## Setting up HTTPS (strongly recommended)

HTTP is fine for testing but you'll want HTTPS for a real site. The easiest way is Certbot with Let's Encrypt — it's free and takes about two minutes.

Install Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
```

Stop the nginx container temporarily (Certbot needs port 80):

```bash
docker compose stop nginx
```

Get your certificate (replace with your actual domain):

```bash
sudo certbot certonly --standalone -d music.yourdomain.com
```

Then update `nginx/default.conf` to add HTTPS. Replace the contents with:

```nginx
server {
    listen 80;
    server_name music.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name music.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/music.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/music.yourdomain.com/privkey.pem;

    client_max_body_size 500M;
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Update `docker-compose.yml` to mount the certificates into the nginx container:

```yaml
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app
```

Also update `APP_BASE_URL` in your `.env` to use `https://`.

Restart everything:

```bash
docker compose up -d
```

Set up automatic renewal (certificates expire every 90 days):

```bash
sudo crontab -e
```

Add this line:

```
0 3 * * * certbot renew --quiet && docker compose -f /path/to/music-streaming-server/docker-compose.yml restart nginx
```

---

## Part 3: Setting up subscriptions (optional)

Subscriptions let listeners pay a monthly fee to unlock all tracks you've marked as "paid". They subscribe through a PayPal button that appears right in the player.

**Before starting, you need:**
- The site working (Parts 1 and 2 complete)
- A PayPal Business account with identity verification approved

---

### Step 1: Get your PayPal Developer credentials

1. Go to [developer.paypal.com](https://developer.paypal.com) — log in with your PayPal Business account
2. Click **Apps & Credentials** in the top menu
3. You'll see two tabs: **Sandbox** (for testing) and **Live** (for real money). Start with **Sandbox**.
4. Under Sandbox, click **Create App**
5. Give it a name and choose **Merchant** as the type
6. Click **Create App**
7. Copy the **Client ID** and **Secret** — you'll need both shortly

> **Sandbox vs Live:** Sandbox is a test environment — no real money. Use it to make sure everything works, then switch to Live when you're ready.

---

### Step 2: Create a subscription plan in PayPal

1. Go to **Products & Plans** in the PayPal Developer menu
2. Create a **Product** (this represents your music catalogue):
   - Click **Create product**, give it a name like "Music Subscription", type: **Service**
3. Create a **Plan** for that product:
   - Set billing cycle (e.g. Monthly) and price
   - Click **Create plan**
4. Copy the **Plan ID** — it starts with `P-`

---

### Step 3: Generate a payment secret

This is a random string your server uses to sign access tokens. Run this on your server:

```bash
openssl rand -hex 32
```

Copy the output.

---

### Step 4: Add the payment settings to your .env

Open your `.env` file again (`nano .env`) and add:

```
PAYMENT_SECRET=paste-the-random-string-you-just-generated
PAYPAL_CLIENT_ID=paste-your-paypal-client-id
PAYPAL_CLIENT_SECRET=paste-your-paypal-client-secret
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
```

Restart the app to pick up the new settings:

```bash
docker compose restart app
```

---

### Step 5: Configure subscriptions in site settings

1. Go to `http://your-server/admin-settings.html`
2. Scroll to **Subscriptions & payment gating**
3. Fill in:
   - **Subscriptions enabled:** On
   - **PayPal Subscription Plan ID:** your `P-...` plan ID
   - **Price display:** e.g. `£5/month`
   - **Subscribe button label:** e.g. `Subscribe to unlock everything`
4. Click **Save settings**

---

### Step 6: Mark tracks as paid

Go to `http://your-server/edit.html`, and click the **Paid** column on any track to gate it. The bulk buttons at the top let you gate or ungate everything at once.

---

### Step 7: Test it

In the player, click a paid track — you should see the subscription modal with a PayPal Subscribe button. Use one of PayPal's [test accounts](https://developer.paypal.com/dashboard/accounts) to complete a test subscription.

---

### Step 8: Go live with real payments

1. In PayPal Developer → **Apps & Credentials** → switch to the **Live** tab
2. Create a new app and a new product/plan (same process)
3. Update your `.env`:
   - `PAYPAL_CLIENT_ID` → new Live Client ID
   - `PAYPAL_CLIENT_SECRET` → new Live Secret
   - `PAYPAL_API_BASE` → `https://api-m.paypal.com`
4. In admin-settings.html, update the Plan ID to your new Live plan ID
5. Restart: `docker compose restart app`

---

## Managing your music

| Page | What it's for |
|---|---|
| `/insert.html` | Upload new tracks |
| `/edit.html` | Edit track metadata, toggle paid/published |
| `/edit-albums.html` | Edit album details, sort order |
| `/admin-settings.html` | All site settings including subscriptions |
| `/admin-artwork.html` | Upload album artwork |

---

## Keeping your site updated

Pull the latest code and rebuild:

```bash
git pull
docker compose up -d --build
```

Your music and settings are stored in the `./storage` directory, which is not touched by updates.

---

## Backing up your data

Everything important is in one place: the `./storage` directory.

```bash
tar -czf backup-$(date +%Y%m%d).tar.gz storage/
```

That archive contains all your uploaded files, track metadata, and site settings. Copy it somewhere safe.

---

## Common problems

**The player loads but there are no tracks**
Check that the app container is running: `docker compose ps`. If it shows as stopped, check the logs: `docker compose logs app`.

**"Unauthorized" when logging in to admin**
The token you type must exactly match `ADMIN_API_TOKEN` in your `.env` file — it's case-sensitive, no spaces.

**Uploads fail or time out**
Large files take time. The nginx config allows 500MB and 5-minute timeouts, which should cover most audio files. If you're uploading very large files over a slow connection, the chunked uploader in `/insert.html` handles this automatically.

**"PayPal button doesn't appear"**
Check `PAYPAL_CLIENT_ID` is set in `.env` and that **Subscriptions enabled** is On in admin-settings.html. Also confirm the Plan ID starts with `P-`. Restart the app after any `.env` change.

**"I subscribed but the track won't play"**
Check `PAYMENT_SECRET` is set. If it's missing, access tokens can't be created. Restart the app after adding it.

**"A subscriber says they've lost access"**
They can recover access by pasting their PayPal Subscription ID into the "Already subscribed? Restore access" section of the modal. Their ID is in PayPal under Payments → Subscriptions.

**The site is slow after a restart**
Normal — Docker is starting up. Give it 10–15 seconds.

---

## Environment variables reference

### Required

| Variable | Description |
|---|---|
| `APP_BASE_URL` | Your site's public URL, e.g. `https://music.yourdomain.com` |
| `ADMIN_API_TOKEN` | Your admin password — protects all write operations |

### Optional (have sensible defaults)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the Node.js server listens on inside Docker |
| `STORAGE_ROOT` | `./storage` | Where files and metadata are stored |
| `DISCOVERY_OPT_IN` | `false` | Set `true` to allow your catalogue to appear in public discovery feeds |

### Payments (only needed for subscriptions)

| Variable | Description |
|---|---|
| `PAYMENT_SECRET` | Random string for signing access tokens — generate once, never change |
| `PAYPAL_CLIENT_ID` | From your PayPal Developer app |
| `PAYPAL_CLIENT_SECRET` | From your PayPal Developer app |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` (testing) or `https://api-m.paypal.com` (live) |

---

## License

MIT

## Author

Simon Indelicate
