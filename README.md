# MechCh-Streaming-Site---Copy

A music streaming website to stream tracks from albums contained in a MongoDb Database for deployment on Netlify using serverless functions.

## Table of Contents

- [Install](#install)
- [Usage](#usage)
- [Contributing](#contributing)   
- [License](#license)

## Install

Clone the repository.

Make sure you have Node.js installed

Open a command window in your local directory and install the dependecies:

- npm install body-parser 
- npm install colorthief
- npm install mongodb

You should now be able to preview your site locally by typing 'netlify dev'.

## Usage

In order for there to be content in your streaming site, you need a mongo database. Google what that is and set one up then add a json document that looks something like this:

``` {
  "_id": {
    "$oid": "64c3da35be72e17c4c3fddc9"
  },
  "albumName": "Arcadia Park",
  "artistName": "Simon Indelicate",
  "artworkUrl": "https://indelicates.xyz/resources/img/AP/1a.png",
  "mp3Url": "https://www.storygoblins.com/AP-stream/1.mp3",
  "trackName": "Entrance Plaza",
  "trackNumber": "1",
  "albumArtworkUrl": "https://frolicking-chimera-0e5ae9.netlify.app/img/AP/1.png",
  "trackDuration": "3:32"
} 
```

Edit the connection string, db name and collection name in all the files stored in 'api/' (eg. api/tracks.js) to match the db you've set up.

The site should now work locally.

To put it online, sign up for a Netlify account, connect your github and set up a new site to continuously deploy from your new repo.

You can add tracks to your database however you like. This repo includes a few tools to make this easier - to use them open the html files directly.

- insert.html allows you to add new tracks. You can add multiple tracks with the same album info by using the button at the bottom.
- edit.html will show you a list of all tracks in your db. click on any track to see the data associated with it.
- from an indicidual track view page reached in this way, click edit to alter details from your browser.

for these to work you will need to esnure that your db connection is set up correctly in all the relevant js scripts in /api/

**IMPORTANT**

This repo contains no functionality for uploading files. You will need to host your mp3s and artwork somewhere and specify the correct urls for each track and image in your database.

### Quick way to backfill missing track durations

1. Install dependencies once: `npm install`
2. Start the local functions so the endpoint is available: `npx netlify dev`
3. In another terminal, run: `curl -X POST http://localhost:8888/.netlify/functions/fillTrackDurations`

That POST will find any tracks without a `durationSeconds` value, calculate it from each track’s `mp3Url`, and save the results back to your MongoDB using the connection details in `api/dbConfig.js`.


### Consolidate and optimise album artwork

A reusable script (`tools/consolidateArtwork.js`) can downsize all artwork referenced in MongoDB, upload the compressed JPEGs to an FTP folder, and repoint the database to the new URLs. It runs as a dry run by default so you can review planned changes before anything is uploaded or written back to MongoDB.

1. Install dependencies: `npm install`
2. Run a dry run to see what would change (replace the public URL with the HTTP URL that serves your FTP folder):

   ```bash
   node tools/consolidateArtwork.js --public-base-url=https://indelicates.xyz/consolidated-artwork
   ```

3. When happy, run with `--apply` and FTP credentials to upload and update MongoDB. You can pass credentials as CLI flags or environment variables:

   ```bash
   FTP_HOST=indelicates.xyz \
   FTP_USER=u489957361.simonindelicate \
   FTP_PASSWORD=flopsyBunney27 \
   PUBLIC_BASE_URL=https://indelicates.xyz/consolidated-artwork \
   node tools/consolidateArtwork.js --apply --ftp-folder=consolidated-artwork
   ```

The script de-duplicates artwork by hashing the original URLs, resizes to a sensible width (max 1200px) while iteratively adjusting JPEG quality to keep files under ~100KB, skips files already present on the FTP server, avoids re-touching database records that already point at the consolidated location, and **leaves GIF artwork untouched**.

### Generate shareable MP4s from your MongoDB tracks

If you want lightweight MP4s that combine each track's artwork with its MP3 (useful for uploads to video-first platforms), you can generate them locally without reprocessing entries that already have videos.

1. Install ffmpeg locally so the CLI is on your `PATH`.
2. Run the generator (it reads from the same MongoDB details in `api/dbConfig.js`):

   ```bash
   node tools/generateMp4s.js
   ```

   - Videos are written to `uploads/mp4` by default.
   - The script skips tracks that lack artwork/MP3 URLs and any videos that already exist in the output folder.
   - You can override settings like the output folder, maximum artwork dimension, AAC bitrate, and CRF if you want to tune quality/size: `node tools/generateMp4s.js --output-dir=/path/to/mp4s --max-dimension=1080 --audio-bitrate=160k --crf=24`.

Each MP4 uses a static H.264 video stream built from the artwork, `-tune stillimage`, a modest CRF for smaller file sizes, and AAC audio at the configured bitrate.

**CORS**

You will also likely run into problems with cross origin source requests for some functionality in this repo - you will need to allow requests that come from the url where you host your site to access resources from wherever you host them - especially the artwork. If you don't allow requests from locahost urls, the background color sampling will not work in your dev environment.

Album covers that load as CSS backgrounds can succeed even when the host does not send permissive CORS headers because the browser does not attempt to read pixel data. Features like the ColorThief-based theme extraction, however, draw the image to a canvas, which requires a CORS-allowed response; otherwise the canvas is “tainted” and palette detection fails. To keep artwork visible in the UI **and** usable for color extraction, the player routes image URLs through the Netlify function at `api/proxyImage.js`, which fetches the original image and returns it with an `Access-Control-Allow-Origin: *` header and caching enabled.【F:api/proxyImage.js†L1-L31】【F:public/player.html†L270-L340】


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
