// Readers for Fortress 2 Blue data (Android build, assets/Resource.zip) and a tiny PNG writer.
//
// Resource files have no extension; the name is a hex id. Three kinds are inside:
//   RIFF "ICS "  sprite: an ANIH chunk, then one FRAM chunk per frame
//   RIFF "WAVE"  sound effect (PCM)
//   OggS         music
import zlib from 'node:zlib';

export function kindOf(buf) {
  if (buf.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (buf.toString('latin1', 0, 4) !== 'RIFF') return null;
  const form = buf.toString('latin1', 8, 12);
  return form === 'ICS ' ? 'ics' : form === 'WAVE' ? 'wav' : null;
}

// FRAM chunk:
//   u32 width, u32 height, u8 bits (24), u8[3] flags, u8[3] colour key (B,G,R) + pad,
//   i32 delay (ms), i32 anchor x, i32 anchor y, then the pixels.
// Pixels are run-length coded row by row, each row padded to 4 bytes:
//   n < 0x80   n+1 literal BGR pixels follow
//   n >= 0x80  one BGR pixel follows, repeated (n & 0x7f)+1 times
// Pixels equal to the colour key are transparent.
function readFrame(b) {
  const width = b.readUInt32LE(0), height = b.readUInt32LE(4);
  const key = b.readUIntLE(12, 3);
  const delay = b.readInt32LE(16), ax = b.readInt32LE(20), ay = b.readInt32LE(24);
  const rgba = new Uint8Array(width * height * 4);
  let q = 28;
  const put = (o, p) => {
    if (b.readUIntLE(p, 3) === key) return;
    rgba[o] = b[p + 2]; rgba[o + 1] = b[p + 1]; rgba[o + 2] = b[p]; rgba[o + 3] = 255;
  };
  for (let y = 0; y < height; y++) {
    const start = q;
    for (let x = 0; x < width;) {
      const n = b[q++], count = (n & 0x7f) + 1;
      for (let i = 0; i < count && x < width; i++, x++) put((y * width + x) * 4, n & 0x80 ? q : q + i * 3);
      q += n & 0x80 ? 3 : count * 3;
    }
    q = start + Math.ceil((q - start) / 4) * 4;
  }
  if (q !== b.length) throw new Error(`frame data size mismatch (${q} of ${b.length})`);
  return { width, height, delay, ax, ay, rgba };
}

export function readIcs(buf) {
  const frames = [];
  for (let p = 12; p + 8 <= buf.length;) {
    const tag = buf.toString('latin1', p, p + 4), size = buf.readUInt32LE(p + 4);
    if (tag === 'FRAM') frames.push(readFrame(buf.subarray(p + 8, p + 8 + size)));
    p += 8 + size + (size & 1);
  }
  return { frames };
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}
