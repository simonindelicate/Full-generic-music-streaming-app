# Music Streaming Server

Your own music streaming website. Listeners get a player with album artwork, shuffle, and shareable links. You get a web-based admin panel to upload tracks, manage metadata, and — if you want — charge a monthly subscription.

**No platform fees. No algorithm. No one can take it down but you.**

---

## Which version is right for you?

| You want | Use |
|---|---|
| The simplest possible setup — no command line, roughly £3/month | [**Netlify version**](SETUP-NETLIFY.md) |
| Full control, own your server, willing to paste one command into a terminal | [**VPS / Docker version**](#vps--docker-version) |
| Someone else to run it for you — just log in and upload | Hosted platform — coming soon |

---

## Netlify version

See **[SETUP-NETLIFY.md](SETUP-NETLIFY.md)** for the full guide.

**What you need:** a GitHub account and a Netlify account (both free). That's it.

**Cost:** free for most musicians. Netlify's free tier handles the player, the admin panel, and file storage. If you have a very large catalogue or heavy traffic, Netlify's paid plans start at $19/month — but most independent artists will never hit the free tier limits.

---

## VPS / Docker version

Your own Linux server, running everything under your control. One install command and you're done.

### Getting a server

You need a VPS. They start at about £4/month:

- **[Hetzner Cloud](https://www.hetzner.com/cloud)** — CX22, €3.99/month. Excellent value.
- **[DigitalOcean](https://www.digitalocean.com)** — Basic Droplet, $6/month. Good beginner docs.
- **[Hostinger VPS](https://www.hostinger.co.uk/vps-hosting)** — KVM 2, about £5/month.

Choose **Ubuntu 24.04** when creating the server. Note the IP address.

### Install

SSH into your server and run:

```bash
curl -fsSL https://raw.githubusercontent.com/simonindelicate/music-streaming-server/main/install.sh | bash
```

The installer asks two questions (your web address and an admin password), then starts everything. When it finishes, it prints your site address and your admin password. Write the password down.

### Adding your music

Go to `http://YOUR-SERVER-ADDRESS/admin/admin-login.html` and log in with the password the installer gave you. Then go to `/insert.html` — drag and drop MP3s, fill in the track details, click Upload.

### HTTPS (your own domain)

1. Buy a domain name (your hosting provider sells them, or use [Namecheap](https://www.namecheap.com))
2. Point the domain at your server: create an **A record** in your DNS settings pointing to your server's IP address. Allow up to an hour for the change to spread.
3. SSH into your server and run:

```bash
cd ~/music-streaming-server
curl -fsSL https://raw.githubusercontent.com/simonindelicate/music-streaming-server/main/scripts/setup-https.sh | bash
```

### Subscriptions (optional)

See the **Subscriptions** section under [SETUP-NETLIFY.md](SETUP-NETLIFY.md#subscriptions) — the PayPal setup is identical. The only difference is that on the VPS version you edit `~/music-streaming-server/.env` directly rather than setting environment variables in Netlify.

### Useful commands

```bash
# Check the app is running
docker compose -f ~/music-streaming-server/docker-compose.yml ps

# See logs
docker compose -f ~/music-streaming-server/docker-compose.yml logs -f app

# Restart after changing .env
docker compose -f ~/music-streaming-server/docker-compose.yml restart app

# Update to the latest version
cd ~/music-streaming-server && git pull && docker compose up -d --build
```

### Backing up

Everything lives in `~/music-streaming-server/storage/`. Copy this folder to back up your library. Moving to a new server? Copy the folder across and everything moves with it.

---

## Admin pages

Log in at `/admin/admin-login.html`.

| Page | What it does |
|---|---|
| `/insert.html` | Upload tracks |
| `/edit.html` | Edit track info, mark tracks as paid or free |
| `/edit-albums.html` | Edit albums, sort order, publish/unpublish |
| `/admin-artwork.html` | Upload album artwork |
| `/admin-settings.html` | Site name, colours, logo, subscriptions |

---

## License

MIT — Simon Indelicate
