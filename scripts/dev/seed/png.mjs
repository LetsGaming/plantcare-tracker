import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

/** A vertical gradient between two [r, g, b] colors, as PNG bytes. */
export const gradientPng = (width, height, top, bottom) => {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const pixel = top.map((value, i) => Math.round(value + (bottom[i] - value) * t));
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) Buffer.from(pixel).copy(row, 1 + x * 3);
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

export const PALETTE = [
  [[46, 125, 50], [200, 230, 201]],
  [[27, 94, 32], [165, 214, 167]],
  [[85, 139, 47], [220, 237, 200]],
  [[0, 105, 92], [178, 223, 219]],
  [[121, 85, 72], [215, 204, 200]],
];
