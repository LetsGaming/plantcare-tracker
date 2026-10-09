import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { existsSync } from 'node:fs';
import type * as Ort from 'onnxruntime-node';
import {
  EmbedderBusyError,
  OnnxEmbedder,
  loadOnnxEmbedder,
  toTensorData,
} from '../../src/modules/recognition/infrastructure/OnnxEmbedder';

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

const fakeSession = (run: () => Promise<unknown>) => ({ run }) as unknown as Ort.InferenceSession;
class FakeTensor {
  constructor(
    readonly type: string,
    readonly data: unknown,
    readonly dims: number[],
  ) {}
}
const hidden = () => ({ last_hidden_state: { data: new Float32Array(257 * 384).fill(1) } });
const rgb = (width = 300, height = 200) =>
  sharp({ create: { width, height, channels: 3, background: '#4a7' } })
    .jpeg()
    .toBuffer();

describe('toTensorData', () => {
  it('yields three planes for greyscale input', async () => {
    const grey = await sharp({
      create: { width: 300, height: 200, channels: 3, background: '#888' },
    })
      .greyscale()
      .jpeg()
      .toBuffer();
    expect((await toTensorData(grey)).length).toBe(3 * 224 * 224);
    const greyPng = await sharp(grey).toColourspace('b-w').png().toBuffer();
    expect((await toTensorData(greyPng)).length).toBe(3 * 224 * 224);
  });

  it('rejects images above the pixel limit', async () => {
    const big = await sharp({
      create: { width: 2000, height: 2000, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    await expect(toTensorData(big, 1_000_000)).rejects.toThrow(/pixel/i);
  });
});

describe('OnnxEmbedder queue', () => {
  it('rejects with EmbedderBusyError beyond the cap and recovers afterwards', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let fail = false;
    const embedder = new OnnxEmbedder(
      fakeSession(async () => {
        await gate;
        if (fail) throw new Error('inference failed');
        return hidden();
      }),
      FakeTensor as unknown as typeof Ort.Tensor,
    );
    const image = await rgb();
    const accepted = Array.from({ length: 8 }, () => embedder.embed(image));
    await expect(embedder.embed(image)).rejects.toBeInstanceOf(EmbedderBusyError);
    release();
    const results = await Promise.all(accepted);
    expect(results[0]).toHaveLength(384);
    fail = true;
    await expect(embedder.embed(image)).rejects.toThrow('inference failed');
    fail = false;
    await expect(embedder.embed(image)).resolves.toHaveLength(384);
  });
});

describe('loadOnnxEmbedder native binding', () => {
  it('returns null with one warning when the binding fails to load', async () => {
    vi.resetModules();
    vi.doMock('onnxruntime-node', () => {
      throw new Error('binding failed');
    });
    const mod = await import('../../src/modules/recognition/infrastructure/OnnxEmbedder');
    const warnings: string[] = [];
    expect(await mod.loadOnnxEmbedder('models/any.onnx', (m) => warnings.push(m))).toBeNull();
    expect(warnings).toHaveLength(1);
    vi.doUnmock('onnxruntime-node');
  });

  it('does not load the binding without a model path', async () => {
    vi.resetModules();
    const factory = vi.fn(() => ({}));
    vi.doMock('onnxruntime-node', factory);
    const mod = await import('../../src/modules/recognition/infrastructure/OnnxEmbedder');
    expect(await mod.loadOnnxEmbedder(null, () => {})).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    vi.doUnmock('onnxruntime-node');
  });
});
