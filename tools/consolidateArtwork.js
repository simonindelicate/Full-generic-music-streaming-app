#!/usr/bin/env node
const { MongoClient } = require('mongodb');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ftp = require('basic-ftp');
const { Readable } = require('stream');
const config = require('../api/dbConfig');

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));

function parseArgs(argv) {
  const options = {
    apply: false,
    ftpHost: process.env.FTP_HOST,
    ftpUser: process.env.FTP_USER,
    ftpPassword: process.env.FTP_PASSWORD,
    ftpFolder: 'consolidated-artwork',
    publicBaseUrl: process.env.PUBLIC_BASE_URL,
    maxWidth: 1200,
    minQuality: 45,
    maxQuality: 80,
    maxKB: 100,
    minKB: 30,
  };

  argv.forEach((arg) => {
    if (arg === '--apply') options.apply = true;
    else if (arg === '--dry-run') options.apply = false;
    else if (arg.startsWith('--ftp-host=')) options.ftpHost = arg.split('=')[1];
    else if (arg.startsWith('--ftp-user=')) options.ftpUser = arg.split('=')[1];
    else if (arg.startsWith('--ftp-password=')) options.ftpPassword = arg.split('=')[1];
    else if (arg.startsWith('--ftp-folder=')) options.ftpFolder = arg.split('=')[1];
    else if (arg.startsWith('--public-base-url=')) options.publicBaseUrl = arg.split('=')[1];
    else if (arg.startsWith('--max-width=')) options.maxWidth = Number(arg.split('=')[1]);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  });

  return options;
}

function printHelp() {
  console.log(`Usage: node tools/consolidateArtwork.js [options]\n\n` +
    `Options:\n` +
    `  --apply                 Run uploads and DB updates (default is dry-run).\n` +
    `  --ftp-host=HOST         FTP host (env: FTP_HOST).\n` +
    `  --ftp-user=USER         FTP username (env: FTP_USER).\n` +
    `  --ftp-password=PASS     FTP password (env: FTP_PASSWORD).\n` +
    `  --ftp-folder=FOLDER     Remote folder to store consolidated art (default: consolidated-artwork).\n` +
    `  --public-base-url=URL   Public base URL pointing at ftp-folder (env: PUBLIC_BASE_URL).\n` +
    `  --max-width=PX          Maximum width when resizing (default: 1200).\n` +
    `  --help                  Show this message.\n`);
}

function ensureUrl(base, folder, filename) {
  const cleanBase = base.replace(/\/+$/, '');
  const cleanFolder = folder.replace(/^\/+|\/+$/g, '');
  return `${cleanBase}/${cleanFolder}/${filename}`;
}

function isConsolidated(url, publicBaseUrl) {
  if (!url || !publicBaseUrl) return false;
  return url.startsWith(publicBaseUrl.replace(/\/+$/, ''));
}

function isGif(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith('.gif');
  } catch (err) {
    return url.toLowerCase().includes('.gif');
  }
}

function hashFilename(source) {
  return `art-${crypto.createHash('md5').update(source).digest('hex')}.jpg`;
}

async function downloadImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function optimizeImage(buffer, { maxWidth, maxQuality, minQuality, maxKB }) {
  let currentQuality = maxQuality;
  let currentWidth = maxWidth;
  let optimized = buffer;
  let metadata;

  try {
    metadata = await sharp(buffer).metadata();
    if (metadata.width && metadata.width < currentWidth) {
      currentWidth = metadata.width;
    }
  } catch (err) {
    console.warn('Unable to read metadata, using original buffer');
  }

  while (true) {
    optimized = await sharp(buffer)
      .resize({ width: currentWidth, withoutEnlargement: true })
      .jpeg({ quality: currentQuality, progressive: true, mozjpeg: true })
      .toBuffer();

    const sizeKB = optimized.length / 1024;
    if (sizeKB <= maxKB || currentQuality <= minQuality) {
      return { buffer: optimized, sizeKB: Number(sizeKB.toFixed(1)), quality: currentQuality, width: currentWidth };
    }

    if (currentQuality > minQuality + 5) {
      currentQuality -= 5;
    } else {
      currentWidth = Math.floor(currentWidth * 0.9);
    }
  }
}

async function connectFtp({ ftpHost, ftpUser, ftpPassword }) {
  const client = new ftp.Client();
  await client.access({ host: ftpHost, user: ftpUser, password: ftpPassword });
  return client;
}

async function uploadIfNeeded(client, folder, filename, buffer) {
  const remotePath = path.posix.join(folder.replace(/\\/g, '/'), filename);
  try {
    await client.ensureDir(folder);
    const size = await client.size(remotePath);
    if (size > 0) {
      return false;
    }
  } catch (err) {
    // size() will throw if the file does not exist; ignore.
  }
  await client.uploadFrom(Readable.from(buffer), remotePath);
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.publicBaseUrl) {
    console.error('Missing --public-base-url (or PUBLIC_BASE_URL env var).');
    process.exit(1);
  }

  if (options.apply) {
    if (!options.ftpHost || !options.ftpUser || !options.ftpPassword) {
      console.error('FTP credentials are required when --apply is used.');
      process.exit(1);
    }
  }

  const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const collection = client.db(config.databaseName).collection(config.collectionName);

  try {
    const tracks = await collection.find().toArray();
    const mapping = new Map();
    const trackUpdates = [];
    const skippedAlreadyConsolidated = [];
    const skippedGifs = [];

    for (const track of tracks) {
      ['artworkUrl', 'albumArtworkUrl'].forEach((field) => {
        const url = track[field];
        if (!url) return;
        if (isGif(url)) {
          skippedGifs.push(url);
          return;
        }
        if (isConsolidated(url, options.publicBaseUrl)) {
          skippedAlreadyConsolidated.push(url);
          return;
        }
        const filename = hashFilename(url);
        const publicUrl = ensureUrl(options.publicBaseUrl, options.ftpFolder, filename);
        if (!mapping.has(url)) {
          mapping.set(url, { filename, publicUrl, original: url });
        }
        const set = trackUpdates.find((t) => t.id?.equals ? t.id.equals(track._id) : t.id === track._id);
        const updateEntry = set || { id: track._id, updates: {} };
        updateEntry.updates[field] = publicUrl;
        if (!set) trackUpdates.push(updateEntry);
      });
    }

    console.log(`Tracks scanned: ${tracks.length}`);
    console.log(`Artwork references to consolidate: ${mapping.size}`);
    console.log(`GIF artwork left untouched: ${new Set(skippedGifs).size}`);
    console.log(`Already consolidated references: ${new Set(skippedAlreadyConsolidated).size}`);

    if (!options.apply) {
      console.log('\nDry run complete. Use --apply to upload and update the database.');
      return;
    }

    const ftpClient = await connectFtp(options);
    let uploaded = 0;

    try {
      for (const entry of mapping.values()) {
        console.log(`Downloading ${entry.original}`);
        const buffer = await downloadImage(entry.original);
        const optimized = await optimizeImage(buffer, options);
        const saved = await uploadIfNeeded(ftpClient, options.ftpFolder, entry.filename, optimized.buffer);
        if (saved) {
          uploaded += 1;
          console.log(`Uploaded ${entry.filename} (${optimized.sizeKB}kb, quality ${optimized.quality}, width ${optimized.width})`);
        } else {
          console.log(`Skipped upload for ${entry.filename}, file already present.`);
        }
      }
    } finally {
      ftpClient.close();
    }

    if (trackUpdates.length) {
      const ops = trackUpdates.map(({ id, updates }) => ({ updateOne: { filter: { _id: id }, update: { $set: updates } } }));
      const result = await collection.bulkWrite(ops);
      console.log(`Database updated: ${result.modifiedCount} documents.`);
    }

    console.log(`Uploads performed: ${uploaded}`);
  } catch (err) {
    console.error('Failed to consolidate artwork', err);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

if (require.main === module) {
  main();
}
