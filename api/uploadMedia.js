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

const redactHost = (host) => {
  if (!host) return '';
  const [first = '', ...rest] = String(host).split('.');
  if (!rest.length) return `${first.slice(0, 2)}***`;
  return `${first.slice(0, 2)}***.${rest.join('.')}`;
};

const buildDiagnostics = (requestId) => ({
  requestId,
  startedAt: new Date().toISOString(),
  steps: [],
});

const addStep = (diagnostics, stage, data = {}) => {
  diagnostics.steps.push({
    at: new Date().toISOString(),
    stage,
    ...data,
  });
};

exports.handler = async (event) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const diagnostics = buildDiagnostics(requestId);

  if (event.httpMethod !== 'POST') {
    addStep(diagnostics, 'rejected.method', { method: event.httpMethod });
    return json(405, { message: 'Method not allowed', requestId, diagnostics });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    addStep(diagnostics, 'rejected.json_parse', { error: error.message });
    return json(400, { message: 'Invalid JSON body', requestId, diagnostics });
  }

  addStep(diagnostics, 'request.received', {
    hasPinCode: Boolean(body.pinCode),
    fileName: safeFilename(body.fileName),
    folder: normalizeSegment(body.folder || 'misc') || 'misc',
    contentLengthBase64: String(body.contentBase64 || '').length,
  });

  const requiredPin = process.env.ADMIN_PIN || '1310';
  if ((body.pinCode || '') !== requiredPin) {
    addStep(diagnostics, 'rejected.pin_mismatch');
    return json(401, { message: 'Invalid PIN code', requestId, diagnostics });
  }

  const fileName = safeFilename(body.fileName);
  const contentBase64 = body.contentBase64 || '';
  const folder = normalizeSegment(body.folder || 'misc') || 'misc';

  if (!fileName || !contentBase64) {
    addStep(diagnostics, 'rejected.missing_payload', {
      hasFileName: Boolean(fileName),
      hasContentBase64: Boolean(contentBase64),
    });
    return json(400, { message: 'fileName and contentBase64 are required', requestId, diagnostics });
  }

  const ftpHost = process.env.FTP_HOST;
  const ftpUser = process.env.FTP_USER;
  const ftpPassword = process.env.FTP_PASSWORD;
  const ftpBasePath = normalizeSegment(process.env.FTP_BASE_PATH || 'uploads');
  const ftpPublicBaseUrl = String(process.env.FTP_PUBLIC_BASE_URL || '').replace(/\/+$/, '');

  if (!ftpHost || !ftpUser || !ftpPassword || !ftpPublicBaseUrl) {
    addStep(diagnostics, 'rejected.missing_config', {
      hasFtpHost: Boolean(ftpHost),
      hasFtpUser: Boolean(ftpUser),
      hasFtpPassword: Boolean(ftpPassword),
      hasFtpPublicBaseUrl: Boolean(ftpPublicBaseUrl),
    });
    return json(500, {
      message: 'Upload is not configured. Set FTP_HOST, FTP_USER, FTP_PASSWORD and FTP_PUBLIC_BASE_URL.',
      requestId,
      diagnostics,
    });
  }

  const stamp = Date.now();
  const remotePath = [ftpBasePath, folder, `${stamp}-${fileName}`].filter(Boolean).join('/');
  const remoteDirectory = path.posix.dirname(remotePath);
  const buffer = Buffer.from(contentBase64, 'base64');

  addStep(diagnostics, 'upload.prepared', {
    remotePath,
    remoteDirectory,
    ftpHost: redactHost(ftpHost),
    ftpUser,
    secure: process.env.FTP_SECURE === 'true',
    bytes: buffer.length,
  });

  if (!buffer.length) {
    addStep(diagnostics, 'rejected.empty_buffer');
    return json(400, { message: 'Decoded upload file is empty.', requestId, diagnostics });
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    addStep(diagnostics, 'ftp.connect.start');
    await client.access({
      host: ftpHost,
      user: ftpUser,
      password: ftpPassword,
      secure: process.env.FTP_SECURE === 'true',
    });
    addStep(diagnostics, 'ftp.connect.success');

    const ftpStartDir = await client.pwd();
    addStep(diagnostics, 'ftp.pwd.before_ensureDir', { pwd: ftpStartDir });
    await client.ensureDir(remoteDirectory);
    const ftpUploadDir = await client.pwd();
    addStep(diagnostics, 'ftp.pwd.after_ensureDir', { pwd: ftpUploadDir });

    const remoteFileName = path.posix.basename(remotePath);
    await client.uploadFrom(Readable.from(buffer), remoteFileName);
    addStep(diagnostics, 'ftp.upload.complete', { remoteFileName });

    const uploadedFileSize = await client.size(remoteFileName);
    addStep(diagnostics, 'ftp.verify.size', { uploadedFileSize });
    if (uploadedFileSize !== buffer.length) {
      const mismatchMessage = `Uploaded file size mismatch (expected ${buffer.length}, got ${uploadedFileSize})`;
      addStep(diagnostics, 'ftp.verify.failed', { mismatchMessage });
      throw new Error(mismatchMessage);
    }

    const publicUrl = `${ftpPublicBaseUrl}/${remotePath}`;
    addStep(diagnostics, 'upload.success', { publicUrl });

    console.log('Media upload succeeded', {
      requestId,
      remotePath,
      bytes: buffer.length,
      ftpHost: redactHost(ftpHost),
      secure: process.env.FTP_SECURE === 'true',
    });

    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: buffer.length,
      path: remotePath,
      requestId,
      diagnostics,
    });
  } catch (error) {
    addStep(diagnostics, 'upload.failed', {
      errorMessage: error.message,
      errorCode: error.code,
      errorName: error.name,
      stack: error.stack,
    });

    console.error('Upload failed', {
      requestId,
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      diagnostics,
    });

    return json(500, { message: 'Upload failed', detail: error.message, requestId, diagnostics });
  } finally {
    client.close();
  }
};
