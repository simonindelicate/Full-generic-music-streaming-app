# MechCh-Streaming-Site---Copy

A music streaming website to stream tracks from albums contained in a MongoDb Database for deployment on Netlify using serverless functions.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)   
- [License](#license)

## Install (friendly guided flow)

If you hate setup docs, use this order:

1. Deploy the repo to Netlify.
2. Open `https://your-site.netlify.app/install.html`.
3. Pick one mode:
   - **Simple mode (easiest):** keep track data in a JSON file (`public/albumfooter.json`) on Netlify.
   - **Full mode:** use MongoDB for dynamic editing and API-driven updates.
4. Configure uploads so users click one button in-app and files are stored on your media host automatically.

The install page is written for non-technical users and keeps jargon to a minimum. It now includes fields that gather FTP credentials and outputs ready-to-paste Netlify environment variables.

## Usage

### First decision: do you actually need MongoDB?

**No, not always.**

- If you want the easiest install, store your track list in `public/albumfooter.json` and deploy on Netlify.
- If you want dynamic editing, server-side writes, and easier scaling, use MongoDB and set `MONGODB_URI` + `MONGODB_DB_NAME` in Netlify environment variables.

### Data shape example

Whether the data comes from JSON or MongoDB, each track entry should look like this:

```json
{
  "albumName": "Arcadia Park",
  "artistName": "Simon Indelicate",
  "artworkUrl": "https://example.com/artwork.png",
  "mp3Url": "https://example.com/audio.mp3",
  "trackName": "Entrance Plaza",
  "trackNumber": "1",
  "albumArtworkUrl": "https://example.com/album-art.png",
  "trackDuration": "3:32"
}
```

### Uploads for non-technical users (one-click flow)

The desired UX is:

1. User clicks upload in this app.
2. Netlify Function uploads the file to your storage provider (S3-compatible or SFTP host).
3. Function writes the returned public URL into your track data automatically.

That avoids the broken workflow of "go to another website, upload, then come back and paste URLs."

This repository now includes `/.netlify/functions/uploadMedia`, used by `public/insert.html` upload buttons for artwork and track audio.

Set these environment variables in Netlify for one-click uploads:

- `FTP_HOST`
- `FTP_USER`
- `FTP_PASSWORD`
- `FTP_PUBLIC_BASE_URL` (for example `https://media.yourdomain.com`)
- Optional: `FTP_BASE_PATH` (defaults to `uploads`)
- Optional: `FTP_SECURE=true`

### Quick checks

```bash
node -v
npm -v
```

For local development:

```bash
npm install
npx netlify dev
```

Then open `http://localhost:8888/player.html`.

## Contributing

Look, I have no idea what I am doing. I cobbled this thing together with no real understanding and the professional standards of a pig in shoes. It's all hacks and bolt=ons and every bit of it could be improved.

I think the way it gets data in one big dump is probably the worst way to do things - someone should come up with a better way that can scale to a larger db more efficiently.

This is just one example though, anyone with any skills would be able to improve every line, I expect. It could also do with being formatted prettily and commented better throughout. At the bare minimum someone should move the css into its pwn file - I mean how lazy am I, jfc.

I have my version of the site in a private repo so please do anything you want with this.

I'd love it if actual coders took this, genericised and optimised it and made it into something that musicians with no skillz could take and use easily.

## License
*MIT*

## Author  
**Simon Indelicate**

## Contact
[simon@indelicates.com](mailto:simon@indelicates.com)
