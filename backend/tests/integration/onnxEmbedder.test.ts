import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import { loadOnnxEmbedder } from '../../src/modules/recognition/infrastructure/OnnxEmbedder';

const modelPath = process.env.RECOGNITION_MODEL_PATH ?? 'models/dinov2-small-q8.onnx';
const dot = (a: Float32Array, b: Float32Array) => a.reduce((s, x, i) => s + x * b[i], 0);
const picture = (seed: number) =>
  sharp(Buffer.from(Array.from({ length: 64 * 64 * 3 }, (_, i) => (i * seed) % 251)), {
    raw: { width: 64, height: 64, channels: 3 },
  })
    .resize(640, 480)
    .jpeg()
    .toBuffer();

describe.skipIf(!existsSync(modelPath))('OnnxEmbedder', () => {
  it('produces normalised 384-d vectors that are stable under small crops', async () => {
    const embedder = await loadOnnxEmbedder(modelPath, () => {});
    expect(embedder).not.toBeNull();
    const base = await picture(7);
    const cropped = await sharp(base)
      .extract({ left: 20, top: 15, width: 600, height: 450 })
      .toBuffer();
    const other = await picture(13);
    const [a, b, c] = await Promise.all([base, cropped, other].map((img) => embedder!.embed(img)));
    expect(a).toHaveLength(384);
    expect(dot(a, a)).toBeCloseTo(1, 3);
    expect(dot(a, b)).toBeGreaterThan(dot(a, c));
  });
});

describe('loadOnnxEmbedder without a model', () => {
  it('returns null for a missing model file', async () => {
    const warnings: string[] = [];
    expect(await loadOnnxEmbedder('models/missing.onnx', (m) => warnings.push(m))).toBeNull();
    expect(warnings).toHaveLength(1);
    expect(await loadOnnxEmbedder(null, () => {})).toBeNull();
  });
});
