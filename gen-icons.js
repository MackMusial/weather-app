// Generates the PWA icons (no dependencies, uses Node's built-in zlib).
// Run: node gen-icons.js
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

function makePng(size) {
  const w = size;
  const h = size;
  const bytesPerPixel = 4; // RGBA
  const raw = Buffer.alloc(h * (1 + w * bytesPerPixel)); // +1 filter byte per row

  const cx = w / 2;
  const cy = h * 0.46;
  const sunR = w * 0.24;
  const rayR = w * 0.36;

  for (let y = 0; y < h; y++) {
    const rowStart = y * (1 + w * bytesPerPixel);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      // vertical sky gradient
      const t = y / h;
      let r = Math.round(56 + t * 40);
      let g = Math.round(135 + t * 60);
      let b = Math.round(225 - t * 40);

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // sun rays
      const ang = Math.atan2(dy, dx);
      const rayWave = Math.cos(ang * 8);
      if (dist > sunR && dist < rayR && rayWave > 0.45) {
        r = 255; g = 214; b = 92;
      }
      // sun disc
      if (dist < sunR) {
        r = 255; g = 205; b = 66;
      }
      // soft edge on sun
      if (dist >= sunR && dist < sunR + 2) {
        r = 255; g = 224; b = 130;
      }

      const i = rowStart + 1 + x * bytesPerPixel;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }

  const idat = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// CRC32
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = makePng(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`);
}
