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

const toRawBodyBuffer = (event) => {
  const body = event.body || '';
  if (event.isBase64Encoded) return Buffer.from(body, 'base64');
  return Buffer.from(body, 'utf8');
};

const parseMultipartBody = async (event, diagnostics) => {
  const headers = event.headers || {};
  const contentType = headers['content-type'] || headers['Content-Type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) throw new Error('Missing multipart boundary');

  const boundary = `--${boundaryMatch[1].trim().replace(/^"|"$/g, '')}`;
  const rawBuffer = toRawBodyBuffer(event);
  const rawText = rawBuffer.toString('latin1');

  const sections = rawText.split(boundary).slice(1, -1);
  const fields = {};
  let fileName = '';
  let fileBuffer = Buffer.alloc(0);

  for (const section of sections) {
    let part = section;
    if (part.startsWith('\r\n')) part = part.slice(2);
    if (part.endsWith('\r\n')) part = part.slice(0, -2);

    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerText = part.slice(0, headerEnd);
    const bodyText = part.slice(headerEnd + 4);
    const disposition = headerText.split('\r\n').find((line) => /^content-disposition:/i.test(line)) || '';

    const nameMatch = disposition.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;

    const fieldName = nameMatch[1];
    const filenameMatch = disposition.match(/filename="([^"]*)"/i);

    if (filenameMatch) {
      fileName = safeFilename(filenameMatch[1]);
      fileBuffer = Buffer.from(bodyText, 'latin1');
    } else {
      fields[fieldName] = bodyText;
    }
  }

  addStep(diagnostics, 'request.multipart_parsed', {
    fileName,
    folder: normalizeSegment(fields.folder || 'misc') || 'misc',
    bytes: fileBuffer.length,
  });

  return {
    pinCode: fields.pinCode || '',
    fileName,
    folder: normalizeSegment(fields.folder || 'misc') || 'misc',
    buffer: fileBuffer,
  };
};

const parseJsonBody = (event, diagnostics) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    addStep(diagnostics, 'rejected.json_parse', { error: error.message });
    return { error: 'Invalid JSON body' };
  }

  const fileName = safeFilename(body.fileName);
  const contentBase64 = body.contentBase64 || '';
  const buffer = Buffer.from(contentBase64, 'base64');
  const folder = normalizeSegment(body.folder || 'misc') || 'misc';

  addStep(diagnostics, 'request.json_parsed', {
    fileName,
    folder,
    contentLengthBase64: String(contentBase64 || '').length,
    bytes: buffer.length,
  });

  return {
    pinCode: body.pinCode || '',
    fileName,
    folder,
    buffer,
  };
};

exports.handler = async (event) => {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const diagnostics = buildDiagnostics(requestId);

  if (event.httpMethod !== 'POST') {
    addStep(diagnostics, 'rejected.method', { method: event.httpMethod });
    return json(405, { message: 'Method not allowed', requestId, diagnostics });
  }

  const headers = event.headers || {};
  const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();

  let payload;
  if (contentType.includes('multipart/form-data')) {
    try {
      payload = await parseMultipartBody(event, diagnostics);
    } catch (error) {
      addStep(diagnostics, 'rejected.multipart_parse', { error: error.message });
      return json(400, { message: 'Invalid multipart upload payload', detail: error.message, requestId, diagnostics });
    }
  } else {
    const parsed = parseJsonBody(event, diagnostics);
    if (parsed?.error) {
      return json(400, { message: parsed.error, requestId, diagnostics });
    }
    payload = parsed;
  }

  addStep(diagnostics, 'request.received', {
    hasPinCode: Boolean(payload.pinCode),
    fileName: payload.fileName,
    folder: payload.folder,
    bytes: payload.buffer.length,
    contentType,
  });

  const requiredPin = process.env.ADMIN_PIN || '1310';
  if ((payload.pinCode || '') !== requiredPin) {
    addStep(diagnostics, 'rejected.pin_mismatch');
    return json(401, { message: 'Invalid PIN code', requestId, diagnostics });
  }

  if (!payload.fileName || !payload.buffer.length) {
    addStep(diagnostics, 'rejected.missing_payload', {
      hasFileName: Boolean(payload.fileName),
      hasBuffer: Boolean(payload.buffer.length),
    });
    return json(400, { message: 'file and pinCode are required', requestId, diagnostics });
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
  const remotePath = [ftpBasePath, payload.folder, `${stamp}-${payload.fileName}`].filter(Boolean).join('/');
  const remoteDirectory = path.posix.dirname(remotePath);

  addStep(diagnostics, 'upload.prepared', {
    remotePath,
    remoteDirectory,
    ftpHost: redactHost(ftpHost),
    ftpUser,
    secure: process.env.FTP_SECURE === 'true',
    bytes: payload.buffer.length,
  });

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
    await client.uploadFrom(Readable.from(payload.buffer), remoteFileName);
    addStep(diagnostics, 'ftp.upload.complete', { remoteFileName });

    const uploadedFileSize = await client.size(remoteFileName);
    addStep(diagnostics, 'ftp.verify.size', { uploadedFileSize });
    if (uploadedFileSize !== payload.buffer.length) {
      const mismatchMessage = `Uploaded file size mismatch (expected ${payload.buffer.length}, got ${uploadedFileSize})`;
      addStep(diagnostics, 'ftp.verify.failed', { mismatchMessage });
      throw new Error(mismatchMessage);
    }

    const publicUrl = `${ftpPublicBaseUrl}/${remotePath}`;
    addStep(diagnostics, 'upload.success', { publicUrl });

    return json(200, {
      message: 'Upload complete',
      url: publicUrl,
      bytes: payload.buffer.length,
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

    return json(500, { message: 'Upload failed', detail: error.message, requestId, diagnostics });
  } finally {
    client.close();
  }
};
