#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { pipeline } = require('stream');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const config = require('../api/dbConfig');

const fetch = (...args) => import('node-fetch').then(({ default: fetchFn }) => fetchFn(...args));
const pipelineAsync = promisify(pipeline);
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    outputDir: path.join(__dirname, '..', 'uploads', 'mp4'),
    maxDimension: 1280,
    audioBitrate: '192k',
    crf: 23,
  };

  argv.forEach((arg) => {
    if (arg.startsWith('--output-dir=')) options.outputDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--max-dimension=')) options.maxDimension = Number(arg.split('=')[1]);
    else if (arg.startsWith('--audio-bitrate=')) options.audioBitrate = arg.split('=')[1];
    else if (arg.startsWith('--crf=')) options.crf = Number(arg.split('=')[1]);
    else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  });

  return options;
}

function printHelp() {
  console.log(`Usage: node tools/generateMp4s.js [options]\n\n` +
    `Options:\n` +
    `  --output-dir=PATH       Where to store generated MP4s (default: uploads/mp4).\n` +
    `  --max-dimension=PX      Maximum width/height for artwork in the video (default: 1280).\n` +
    `  --audio-bitrate=RATE    AAC bitrate passed to ffmpeg (default: 192k).\n` +
    `  --crf=VALUE             Constant Rate Factor for H.264 quality/size trade-off (default: 23).\n` +
    `  --help                  Show this message.\n`);
}

function slugify(value) {
  return value
    .toString()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
    .slice(0, 80) || 'track';
}

async function ensureFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version']);
  } catch (err) {
    throw new Error('ffmpeg is required on your PATH to run this script.');
  }
}

async function downloadToFile(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  await pipelineAsync(response.body, fs.createWriteStream(destination));
}

function buildOutputPath(track, options) {
  const base = slugify(`${track.artistName || 'artist'}-${track.albumName || 'album'}-${track.trackName || track._id}`);
  const hash = crypto.createHash('md5').update(String(track._id)).digest('hex').slice(0, 8);
  return path.join(options.outputDir, `${base}-${hash}.mp4`);
}

async function createVideo({ audioPath, artworkPath, outputPath, options }) {
  const ffmpegArgs = [
    '-y',
    '-loop', '1',
    '-i', artworkPath,
    '-i', audioPath,
    '-vf', `scale='min(iw,${options.maxDimension})':-2`,
    '-c:v', 'libx264',
    '-tune', 'stillimage',
    '-crf', String(options.crf),
    '-preset', 'medium',
    '-c:a', 'aac',
    '-b:a', options.audioBitrate,
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-shortest',
    outputPath,
  ];

  await execFileAsync('ffmpeg', ffmpegArgs, { windowsHide: true });
}

async function processTrack(track, options) {
  const artworkUrl = track.artworkUrl || track.albumArtworkUrl;
  const audioUrl = track.mp3Url;

  if (!artworkUrl || !audioUrl) {
    return { status: 'skipped', reason: 'missing-assets' };
  }

  const outputPath = buildOutputPath(track, options);
  if (fs.existsSync(outputPath)) {
    return { status: 'skipped', reason: 'already-exists', outputPath };
  }

  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mp4gen-'));
  const audioPath = path.join(tempDir, 'audio');
  const artworkPath = path.join(tempDir, 'artwork');

  try {
    await downloadToFile(audioUrl, audioPath);
    await downloadToFile(artworkUrl, artworkPath);
    await createVideo({ audioPath, artworkPath, outputPath, options });
    return { status: 'created', outputPath };
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await ensureFfmpeg();
  await fs.promises.mkdir(options.outputDir, { recursive: true });

  const client = new MongoClient(config.mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true });
  await client.connect();
  const collection = client.db(config.databaseName).collection(config.collectionName);

  const summary = { total: 0, created: 0, skippedExisting: 0, skippedMissing: 0, failed: 0 };

  try {
    const tracks = await collection.find().toArray();
    summary.total = tracks.length;

    for (const track of tracks) {
      try {
        const result = await processTrack(track, options);
        if (result.status === 'created') {
          summary.created += 1;
          console.log(`Created: ${result.outputPath}`);
        } else if (result.reason === 'already-exists') {
          summary.skippedExisting += 1;
          console.log(`Skipped (already exists): ${result.outputPath}`);
        } else if (result.reason === 'missing-assets') {
          summary.skippedMissing += 1;
          console.log(`Skipped (missing artwork/mp3): ${track._id}`);
        }
      } catch (err) {
        summary.failed += 1;
        console.error(`Failed for ${track._id}:`, err.message);
      }
    }
  } finally {
    await client.close();
  }

  console.log('---');
  console.log(`Tracks scanned: ${summary.total}`);
  console.log(`Created videos: ${summary.created}`);
  console.log(`Skipped (existing videos): ${summary.skippedExisting}`);
  console.log(`Skipped (missing assets): ${summary.skippedMissing}`);
  console.log(`Failed: ${summary.failed}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

