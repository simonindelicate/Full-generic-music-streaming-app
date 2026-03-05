const decodeText = (frameBuffer) => {
  if (!frameBuffer || frameBuffer.length < 2) return '';
  const encodingByte = frameBuffer[0];
  const body = frameBuffer.subarray(1);
  if (encodingByte === 0 || encodingByte === 3) {
    return body.toString('utf8').replace(/\u0000/g, '').trim();
  }
  return body.toString('utf16le').replace(/\u0000/g, '').trim();
};

const syncSafeToInt = (buf) =>
  ((buf[0] & 0x7f) << 21) | ((buf[1] & 0x7f) << 14) | ((buf[2] & 0x7f) << 7) | (buf[3] & 0x7f);

// ID3v2.2 uses 3-char frame IDs and 3-byte big-endian frame sizes.
// Map v2.2 IDs to their v2.3/v2.4 equivalents.
const V22_MAP = {
  TT2: 'TIT2',
  TP1: 'TPE1',
  TAL: 'TALB',
  TRK: 'TRCK',
  TYE: 'TYER',
  TCO: 'TCON',
};

const parseId3v2 = (buffer) => {
  if (!buffer || buffer.length < 10) return {};
  if (buffer.subarray(0, 3).toString('utf8') !== 'ID3') return {};

  const version = buffer[3]; // 2, 3, or 4
  const tagSize = syncSafeToInt(buffer.subarray(6, 10));
  const endOffset = Math.min(buffer.length, 10 + tagSize);
  let offset = 10;
  const tags = {};

  if (version === 2) {
    // ID3v2.2: 3-char ID + 3-byte big-endian size
    while (offset + 6 <= endOffset) {
      const frameId = buffer.subarray(offset, offset + 3).toString('utf8');
      const frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
      if (!/^[A-Z0-9]{3}$/.test(frameId) || frameSize <= 0) break;

      const frameDataStart = offset + 6;
      const frameDataEnd = frameDataStart + frameSize;
      if (frameDataEnd > endOffset) break;

      const canonical = V22_MAP[frameId];
      if (canonical) {
        const frameData = buffer.subarray(frameDataStart, frameDataEnd);
        if (canonical === 'TIT2') tags.title = decodeText(frameData);
        if (canonical === 'TPE1') tags.artist = decodeText(frameData);
        if (canonical === 'TALB') tags.album = decodeText(frameData);
        if (canonical === 'TRCK') tags.trackNumber = decodeText(frameData);
        if (canonical === 'TYER') tags.year = decodeText(frameData);
        if (canonical === 'TCON') tags.genre = decodeText(frameData);
      }

      offset = frameDataEnd;
    }
  } else {
    // ID3v2.3 / ID3v2.4: 4-char ID + 4-byte big-endian size
    while (offset + 10 <= endOffset) {
      const frameId = buffer.subarray(offset, offset + 4).toString('utf8');
      const frameSize = buffer.readUInt32BE(offset + 4);
      if (!/^[A-Z0-9]{4}$/.test(frameId) || frameSize <= 0) break;

      const frameDataStart = offset + 10;
      const frameDataEnd = frameDataStart + frameSize;
      if (frameDataEnd > endOffset) break;

      const frameData = buffer.subarray(frameDataStart, frameDataEnd);
      if (frameId === 'TIT2') tags.title = decodeText(frameData);
      if (frameId === 'TPE1') tags.artist = decodeText(frameData);
      if (frameId === 'TALB') tags.album = decodeText(frameData);
      if (frameId === 'TRCK') tags.trackNumber = decodeText(frameData);
      if (frameId === 'TDRC' || frameId === 'TYER') tags.year = decodeText(frameData);
      if (frameId === 'TCON') tags.genre = decodeText(frameData);

      offset = frameDataEnd;
    }
  }

  return tags;
};

module.exports = {
  parseId3v2,
};
