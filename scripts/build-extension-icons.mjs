// generate extension icons (16/32/48/128) without any image library.
// draws a 2013-blue rounded square with a white nested-square "throwback"
// motif. emits public/icons/icon-{size}.png.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [0x41, 0x83, 0xc4, 0xff]; // 2013 github accent blue (#4183c4)
const FG = [0xff, 0xff, 0xff, 0xff]; // white
const TRANSPARENT = [0, 0, 0, 0];

function buildPixels(size) {
  const buf = new Uint8Array(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.18));
  const stroke = Math.max(1, Math.round(size * 0.07));
  // nested squares — outer ring + inner small square
  const outerInset = Math.round(size * 0.22);
  const innerInset = Math.round(size * 0.40);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inBg = insideRoundedRect(x, y, size, radius);
      let color;
      if (!inBg) {
        color = TRANSPARENT;
      } else if (
        onRect(x, y, outerInset, size - outerInset - 1, stroke) ||
        insideRect(x, y, innerInset, size - innerInset - 1)
      ) {
        color = FG;
      } else {
        color = BG;
      }
      const off = (y * size + x) * 4;
      buf[off] = color[0];
      buf[off + 1] = color[1];
      buf[off + 2] = color[2];
      buf[off + 3] = color[3];
    }
  }
  return buf;
}

function insideRoundedRect(x, y, size, radius) {
  const right = size - 1;
  const bottom = size - 1;
  if (x < radius && y < radius) return dist(x, y, radius, radius) <= radius;
  if (x > right - radius && y < radius) return dist(x, y, right - radius, radius) <= radius;
  if (x < radius && y > bottom - radius) return dist(x, y, radius, bottom - radius) <= radius;
  if (x > right - radius && y > bottom - radius) return dist(x, y, right - radius, bottom - radius) <= radius;
  return true;
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function onRect(x, y, lo, hi, stroke) {
  const onEdge = (
    (x >= lo && x <= hi && (Math.abs(y - lo) < stroke || Math.abs(y - hi) < stroke)) ||
    (y >= lo && y <= hi && (Math.abs(x - lo) < stroke || Math.abs(x - hi) < stroke))
  );
  return onEdge;
}

function insideRect(x, y, lo, hi) {
  return x >= lo && x <= hi && y >= lo && y <= hi;
}

// minimal PNG encoder: 8-bit RGBA, filter-type 0 on every scanline.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x];
  }
  const idat = deflateSync(raw, { level: 9 });
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", iend),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  const pixels = buildPixels(size);
  const png = encodePng(size, size, pixels);
  const file = resolve(outDir, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
