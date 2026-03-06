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

// Returns position of first byte after the null terminator starting at `offset`.
function findNullTerm(buf, offset, encoding) {
  if (encoding === 1 || encoding === 2) {
    // UTF-16: look for 0x00 0x00 pair
    for (let i = offset; i + 1 < buf.length; i += 2) {
      if (buf[i] === 0 && buf[i + 1] === 0) return i + 2;
    }
  } else {
    // Latin-1 / UTF-8
    for (let i = offset; i < buf.length; i++) {
      if (buf[i] === 0) return i + 1;
    }
  }
  return buf.length;
}

// ID3v2.2 3-char → 4-char frame ID mapping
const V22_MAP = {
  TT2: 'TIT2',
  TP1: 'TPE1',
  TAL: 'TALB',
  TRK: 'TRCK',
  TYE: 'TYER',
  TCO: 'TCON',
  TLE: 'TLEN',
};

const parseId3v2 = (buffer) => {
  if (!buffer || buffer.length < 10) return {};
  if (buffer.subarray(0, 3).toString('utf8') !== 'ID3') return {};

  const version = buffer[3]; // 2 = v2.2, 3 = v2.3, 4 = v2.4
  const tagSize = syncSafeToInt(buffer.subarray(6, 10));
  const endOffset = Math.min(buffer.length, 10 + tagSize);
  let offset = 10;
  const tags = {};

  if (version === 2) {
    // ID3v2.2: 3-char frame ID + 3-byte big-endian size (no flags)
    while (offset + 6 <= endOffset) {
      const frameId = buffer.subarray(offset, offset + 3).toString('utf8');
      const frameSize = (buffer[offset + 3] << 16) | (buffer[offset + 4] << 8) | buffer[offset + 5];
      if (!/^[A-Z0-9]{3}$/.test(frameId) || frameSize <= 0) break;

      const frameDataStart = offset + 6;
      const frameDataEnd = frameDataStart + frameSize;
      if (frameDataEnd > endOffset) break;

      const frameData = buffer.subarray(frameDataStart, frameDataEnd);

      const canonical = V22_MAP[frameId];
      if (canonical) {
        if (canonical === 'TIT2') tags.title = decodeText(frameData);
        if (canonical === 'TPE1') tags.artist = decodeText(frameData);
        if (canonical === 'TALB') tags.album = decodeText(frameData);
        if (canonical === 'TRCK') tags.trackNumber = decodeText(frameData);
        if (canonical === 'TYER') tags.year = decodeText(frameData);
        if (canonical === 'TCON') tags.genre = decodeText(frameData);
        if (canonical === 'TLEN') tags.durationMs = Number(decodeText(frameData)) || null;
      }

      // PIC = ID3v2.2 picture frame
      if (frameId === 'PIC') {
        try {
          const encoding = frameData[0];
          const fmt = frameData.subarray(1, 4).toString('ascii').trim().toLowerCase();
          const mimeType = fmt === 'jpg' ? 'image/jpeg' : fmt === 'png' ? 'image/png' : `image/${fmt}`;
          const picType = frameData[4];
          const descEnd = findNullTerm(frameData, 5, encoding);
          const imageData = frameData.subarray(descEnd);
          if (imageData.length > 0 && (!tags.artwork || picType === 3)) {
            tags.artwork = { mimeType, data: imageData };
          }
        } catch (_) {}
      }

      offset = frameDataEnd;
    }
  } else {
    // ID3v2.3 / ID3v2.4: 4-char frame ID + 4-byte big-endian size + 2-byte flags
    while (offset + 10 <= endOffset) {
      const frameId = buffer.subarray(offset, offset + 4).toString('utf8');
      const frameSize = buffer.readUInt32BE(offset + 4);
      if (!/^[A-Z0-9]{4}$/.test(frameId) || frameSize <= 0) break;

      const frameDataStart = offset + 10;
      const frameDataEnd = frameDataStart + frameSize;

      if (frameDataEnd > endOffset) {
        // Frame extends beyond the fetched buffer.
        // For APIC: parse the small in-buffer header to record the image's
        // exact file offset + size so the caller can fetch it separately.
        if (frameId === 'APIC' && frameDataStart + 20 < buffer.length) {
          try {
            const encoding = buffer[frameDataStart];
            const mimeEnd = buffer.indexOf(0, frameDataStart + 1);
            if (mimeEnd > frameDataStart && mimeEnd < buffer.length - 2) {
              const mimeType = buffer.subarray(frameDataStart + 1, mimeEnd).toString('ascii') || 'image/jpeg';
              const picType = buffer[mimeEnd + 1];
              const descEnd = findNullTerm(buffer, mimeEnd + 2, encoding);
              // descEnd is an absolute position in the file (buffer was fetched from byte 0)
              const imageDataSize = frameSize - (descEnd - frameDataStart);
              if (imageDataSize > 0 && (!tags.artworkRef || picType === 3)) {
                tags.artworkRef = { fileOffset: descEnd, dataSize: imageDataSize, mimeType };
              }
            }
          } catch (_) {}
        }
        break;
      }

      const frameData = buffer.subarray(frameDataStart, frameDataEnd);
      if (frameId === 'TIT2') tags.title = decodeText(frameData);
      if (frameId === 'TPE1') tags.artist = decodeText(frameData);
      if (frameId === 'TALB') tags.album = decodeText(frameData);
      if (frameId === 'TRCK') tags.trackNumber = decodeText(frameData);
      if (frameId === 'TDRC' || frameId === 'TYER') tags.year = decodeText(frameData);
      if (frameId === 'TCON') tags.genre = decodeText(frameData);
      if (frameId === 'TLEN') tags.durationMs = Number(decodeText(frameData)) || null;

      // APIC = attached picture
      if (frameId === 'APIC') {
        try {
          const encoding = frameData[0];
          const mimeEnd = frameData.indexOf(0, 1);
          if (mimeEnd > 0) {
            const mimeType = frameData.subarray(1, mimeEnd).toString('ascii') || 'image/jpeg';
            const picType = frameData[mimeEnd + 1];
            const descEnd = findNullTerm(frameData, mimeEnd + 2, encoding);
            const imageData = frameData.subarray(descEnd);
            if (imageData.length > 0 && (!tags.artwork || picType === 3)) {
              tags.artwork = { mimeType, data: imageData };
            }
          }
        } catch (_) {}
      }

      offset = frameDataEnd;
    }
  }

  return tags;
};

module.exports = {
  parseId3v2,
};
