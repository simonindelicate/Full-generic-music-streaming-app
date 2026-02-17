const path = require('path');
const { Readable } = require('stream');
const ftp = require('basic-ftp');

const normalizeSegment = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

const safeFilename = (name) => {
  const base = path.basename(String(name || 'upload.bin'));
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
};

const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { message: 'Method not allowed' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return json(400, { message: 'Invalid JSON body' });
  }

  const requiredPin = process.env.ADMIN_PIN || '1310';
  if ((body.pinCode || '') !== requiredPin) {
    return json(401, { message: 'Invalid PIN code' });
  }

  const fileName = safeFilename(body.fileName);
  const contentBase64 = body.contentBase64 || '';
  const folder = normalizeSegment(body.folder || 'misc') || 'misc';

  if (!fileName || !contentBase64) {
    return json(400, { message: 'fileName and contentBase64 are required' });
  }

  const ftpHost = process.env.FTP_HOST;
  const ftpUser = process.env.FTP_USER;
  const ftpPassword = process.env.FTP_PASSWORD;
  const ftpBasePath = normalizeSegment(process.env.FTP_BASE_PATH || 'uploads');
  const ftpPublicBaseUrl = String(process.env.FTP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  if (!ftpHost || !ftpUser || !ftpPassword || !ftpPublicBaseUrl) {
    return json(500, {
      message: 'Upload is not configured. Set FTP_HOST, FTP_USER, FTP_PASSWORD and FTP_PUBLIC_BASE_URL.',
    });
  }

  const stamp = Date.now();
  const remotePath = [ftpBasePath, folder, `${stamp}-${fileName}`].filter(Boolean).join('/');
  const remoteDirectory = path.posix.dirname(remotePath);
  const buffer = Buffer.from(contentBase64, 'base64');

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: ftpHost,
      user: ftpUser,
      password: ftpPassword,
      secure: process.env.FTP_SECURE === 'true',
    });

    await client.ensureDir(remoteDirectory);
    await client.uploadFrom(Readable.from(buffer), path.posix.basename(remotePath));

    const publicUrl = `${ftpPublicBaseUrl}/${remotePath}`;
    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: buffer.length,
      path: remotePath,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    return json(500, { message: 'Upload failed', detail: error.message });
  } finally {
    client.close();
  }
};
