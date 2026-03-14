# Music Streaming Server

Your own music streaming website. Listeners get a proper player with album artwork, shuffle, and shareable links. You get a web-based admin panel to upload tracks, manage metadata, and — if you want — charge a monthly subscription.

**No platform fees. No algorithm. No one can take it down but you.**

---

## Wait — is this the right version for you?

**This version requires a VPS** — a type of server that gives you full control over Linux. It will NOT work on standard web hosting packages from GoDaddy, Hostinger, Namecheap, Bluehost, or similar.

Not sure what you have? Ask yourself: *can I SSH into my server?* If you don't know what SSH is, you almost certainly need the other version.

| You have | Use |
|---|---|
| Standard web hosting (cPanel, file manager, FTP) | [The Netlify version](https://github.com/simonindelicate/Full-generic-music-streaming-app) |
| A VPS, cloud server, or dedicated server | **This version — keep reading** |
| Nothing yet and want the easiest self-hosted option | **This version — get a VPS below** |

---

## Getting a server (skip this if you already have one)

You need a VPS. They start at about £4/month. Any of these work:

- **[Hetzner Cloud](https://www.hetzner.com/cloud)** — CX22, €3.99/month. Excellent value, very fast setup.
- **[DigitalOcean](https://www.digitalocean.com)** — Basic Droplet, $6/month. Simple interface, good beginner docs.
- **[Hostinger VPS](https://www.hostinger.co.uk/vps-hosting)** — KVM 2, about £5/month.

When creating your server, choose **Ubuntu 24.04** as the operating system. Make a note of the IP address it gives you — you'll need it in a moment.

> **What is a VPS?** It's a small computer in a data centre that runs 24/7. You connect to it over the internet and tell it what to do. You'll only need to do that once — for the install.

---

## Install

SSH into your new server (your hosting provider will tell you how — it's usually one click in their control panel), then paste this single command:

```bash
curl -fsSL https://raw.githubusercontent.com/simonindelicate/music-streaming-server/main/install.sh | bash
```

The installer will:
1. Install everything it needs (takes about a minute)
2. Ask for your server's web address
3. Ask you to choose an admin password (or generate one for you)
4. Start your site

**That's it.** When it finishes, it prints your site address and your admin password. Write the password down.

---

## Adding your music

Go to `http://YOUR-SERVER-ADDRESS/admin/admin-login.html` and log in with the password the installer gave you.

Then go to `/insert.html` — drag and drop MP3s, fill in the track details, click Upload.

Visit your site's home page and your music will be there.

---

## Setting up HTTPS (your own domain)

HTTP (the default) is fine for testing but you'll want a proper `https://` address for a real site. You need:

1. A domain name — your hosting provider probably sells these, or use [Namecheap](https://www.namecheap.com)
2. Point the domain at your server: in your domain's DNS settings, create an **A record** pointing to your server's IP address. Changes take up to an hour to spread.

Then SSH into your server and run:

```bash
cd ~/music-streaming-server
curl -fsSL https://raw.githubusercontent.com/simonindelicate/music-streaming-server/main/scripts/setup-https.sh | bash
```

It will ask for your domain name and handle the rest.

---

## Personalising your site

Go to `/admin-settings.html` to set:
- Site name and artist name
- Logo, favicon, colours, fonts
- Welcome message and about page

Changes save immediately — no restart needed.

---

## Setting up subscriptions (optional)

Subscriptions let listeners pay a monthly fee to unlock tracks you've marked as "paid". They subscribe through a PayPal button that appears right in the player.

**You need a PayPal Business account first.** This is free to create but takes 1–3 days to verify. [Sign up here](https://www.paypal.com) → Sign Up → Business account.

Once verified:

### 1. Get your PayPal keys

1. Go to [developer.paypal.com](https://developer.paypal.com) and log in with your PayPal Business account
2. Click **Apps & Credentials** → **Sandbox** tab → **Create App**
3. Give it any name, choose **Merchant**, click **Create App**
4. Copy the **Client ID** and **Secret** — you'll need both

### 2. Create a subscription plan

1. Click **Products & Plans** → **Create product** → name it anything, type **Service** → Save
2. Click **Create plan** on your new product → set your price and billing period → Create
3. Copy the **Plan ID** — it starts with `P-`

### 3. Add your PayPal details to the server

SSH into your server and edit the settings file:

```bash
nano ~/music-streaming-server/.env
```

Fill in these lines:

```
PAYPAL_CLIENT_ID=paste-your-client-id-here
PAYPAL_CLIENT_SECRET=paste-your-secret-here
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
```

Save (`Ctrl+X`, then `Y`, then `Enter`), then restart:

```bash
cd ~/music-streaming-server && docker compose restart app
```

### 4. Switch on subscriptions in your site settings

Go to `/admin-settings.html` → **Subscriptions & payment gating** → turn **Subscriptions enabled** to On, paste your `P-...` Plan ID, set your price text.

### 5. Test it

In the player, click a paid track. The subscription modal should appear. Use one of PayPal's [test accounts](https://developer.paypal.com/dashboard/accounts) to do a test subscription — no real money is charged in sandbox mode.

### 6. Go live

When happy: go back to developer.paypal.com → switch to the **Live** tab → create a new app and plan → update your `.env` with the live credentials and change `PAYPAL_API_BASE` to `https://api-m.paypal.com` → restart → update the Plan ID in admin-settings.

---

## Useful commands (SSH into your server to run these)

```bash
# Check the app is running
docker compose -f ~/music-streaming-server/docker-compose.yml ps

# See what's happening (press Ctrl+C to stop watching)
docker compose -f ~/music-streaming-server/docker-compose.yml logs -f app

# Restart after changing .env
docker compose -f ~/music-streaming-server/docker-compose.yml restart app

# Update to the latest version
cd ~/music-streaming-server && git pull && docker compose up -d --build
```

---

## Backing up your music

All your uploaded files, track data, and settings live in one folder:

```bash
~/music-streaming-server/storage/
```

Back it up by copying it somewhere safe. If you ever move to a new server, copy this folder across and your library moves with it.

---

## Admin pages

Log in at `/admin/admin-login.html` with your admin password.

| Page | What it does |
|---|---|
| `/insert.html` | Upload tracks |
| `/edit.html` | Edit track info, mark tracks as paid or free |
| `/edit-albums.html` | Edit albums, sort order, publish/unpublish |
| `/admin-artwork.html` | Upload album artwork |
| `/admin-settings.html` | Site name, colours, logo, subscriptions |

---

## Common problems

**The site loads but there are no tracks**
Check the app is running: `docker compose -f ~/music-streaming-server/docker-compose.yml ps`. If the `app` row shows as stopped, check logs for errors.

**"Unauthorized" when logging in**
Your password must exactly match `ADMIN_API_TOKEN` in `~/music-streaming-server/.env`. Copy-paste it rather than typing it.

**Uploads time out on big files**
The server allows uploads up to 500MB. If you're uploading over a very slow connection, use the folder batch uploader in `/insert.html` which splits large uploads into chunks.

**PayPal button doesn't appear**
Check that `PAYPAL_CLIENT_ID` is in your `.env`, that you restarted the app after adding it, and that **Subscriptions enabled** is On in admin-settings. Plan ID must start with `P-`.

**"I subscribed but the track won't play"**
Your `.env` is missing `PAYMENT_SECRET`. Run:

```bash
echo "PAYMENT_SECRET=$(openssl rand -hex 32)" >> ~/music-streaming-server/.env
docker compose -f ~/music-streaming-server/docker-compose.yml restart app
```

**A subscriber lost access**
They can get it back by pasting their PayPal Subscription ID into the "Already subscribed? Restore access" section of the modal. It's in their PayPal account under Payments → Subscriptions.

---

## License

MIT — Simon Indelicate
