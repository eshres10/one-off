/**
 * Generates /public/textures/grain.png: a 128×128 monochrome noise tile on a transparent
 * background at ~4% alpha. It is tiled at its natural 128px size (never stretched) by the
 * .glass-* utilities. Deterministic; no image libraries needed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { rng } from './seed-data';

const SIZE = 128;
const ALPHA = 10; // 10/255 ≈ 4%
const r = rng('grain');

// Grey + alpha rows, each prefixed with filter byte 0. Every pixel is a random grey.
const rows = Buffer.alloc(SIZE * (1 + SIZE * 2));
for (let y = 0; y < SIZE; y++) {
  const o = y * (1 + SIZE * 2);
  for (let x = 0; x < SIZE; x++) {
    rows[o + 1 + x * 2] = Math.floor(r.next() * 256);
    rows[o + 2 + x * 2] = ALPHA;
  }
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 4; // greyscale + alpha
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(rows, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.resolve(__dirname, '../public/textures/grain.png');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(`Wrote ${out} (${png.length} bytes)`);
