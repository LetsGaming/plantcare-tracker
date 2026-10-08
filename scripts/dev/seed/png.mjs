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

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);

const seededRandom = (seed) => {
  let state = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

/** A fan of leaves growing from the bottom centre; fully determined by width, height and variant. */
const leafFan = (width, height, variant) => {
  const random = seededRandom(variant + 1);
  const count = 5 + (variant % 3);
  const baseX = width * (0.46 + random() * 0.08);
  const baseY = height * 0.96;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const spread = count === 1 ? 0 : i / (count - 1) - 0.5;
    const tilt = spread * 2.2 + (random() - 0.5) * 0.25;
    const length = height * (0.28 + random() * 0.14);
    const girth = length * (0.3 + random() * 0.08);
    leaves.push({
      cx: baseX + Math.sin(tilt) * length,
      cy: baseY - Math.cos(tilt) * length,
      cos: Math.cos(tilt),
      sin: Math.sin(tilt),
      length,
      girth,
      shade: 0.3 + random() * 0.25,
    });
  }
  return { baseX, baseY, leaves };
};

/** Soft coverage of the leaf at a pixel (0 outside, 1 inside) plus which side of the midrib it is on. */
const leafAt = (leaf, x, y) => {
  const dx = x - leaf.cx;
  const dy = y - leaf.cy;
  const along = (dx * leaf.sin - dy * leaf.cos) / leaf.length;
  const across = dx * leaf.cos + dy * leaf.sin;
  if (Math.abs(along) >= 1) return null;
  const half = leaf.girth * Math.pow(1 - along * along, 0.85);
  const edge = clamp01((half - Math.abs(across)) / 1.5);
  if (edge === 0) return null;
  return { edge, across, rib: Math.abs(across) < 1.1 };
};

/**
 * A vertical gradient between two [r, g, b] colors, as PNG bytes. A leaf fan in a darker tone of
 * the top color is drawn over it so the picture reads as a plant.
 */
export const gradientPng = (width, height, top, bottom, variant = 0) => {
  const fan = leafFan(width, height, variant);
  const stem = mix(top, [10, 40, 15], 0.5);
  const rows = [];
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const background = top.map((value, i) => value + (bottom[i] - value) * t);
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      let color = background;
      if (y > fan.baseY - height * 0.1 && Math.abs(x - fan.baseX) < 3) color = stem;
      for (const leaf of fan.leaves) {
        const hit = leafAt(leaf, x, y);
        if (!hit) continue;
        const body = mix(top, [14, 60, 22], leaf.shade + (hit.across > 0 ? 0.12 : 0));
        const painted = hit.rib ? mix(body, [225, 240, 215], 0.35) : body;
        color = mix(color, painted, hit.edge);
      }
      for (let c = 0; c < 3; c++) row[1 + x * 3 + c] = Math.round(color[c]);
    }
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
