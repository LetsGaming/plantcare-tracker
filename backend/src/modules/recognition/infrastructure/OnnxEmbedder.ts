import type * as Ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

const RESIZE = 256;
const CROP = 224;
const DIM = 384;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MAX_INPUT_PIXELS = 64_000_000;
const MAX_PENDING_EMBEDS = 8;

export class EmbedderBusyError extends Error {
  constructor() {
    super('Too many images are being embedded right now');
    this.name = 'EmbedderBusyError';
  }
}

export const toTensorData = async (
  image: Buffer,
  limitInputPixels = MAX_INPUT_PIXELS,
): Promise<Float32Array> => {
  const { data: resized, info } = await sharp(image, { limitInputPixels })
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .resize({ width: RESIZE, height: RESIZE, fit: 'outside', kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = await sharp(resized, {
    raw: { width: info.width, height: info.height, channels: 3 },
    limitInputPixels,
  })
    .extract({
      left: Math.floor((info.width - CROP) / 2),
      top: Math.floor((info.height - CROP) / 2),
      width: CROP,
      height: CROP,
    })
    .raw()
    .toBuffer();
  const plane = CROP * CROP;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (pixels[i * 3 + c] / 255 - MEAN[c]) / STD[c];
  }
  return out;
};

export class OnnxEmbedder implements Embedder {
  readonly modelId = 'dinov2-small-q8';
  readonly confidentScore = 0.6;
  /** Inference runs one at a time so a burst of uploads cannot starve a small machine. */
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  constructor(
    private readonly session: Ort.InferenceSession,
    private readonly tensor: typeof Ort.Tensor,
  ) {}

  embed(image: Buffer): Promise<Float32Array> {
    if (this.pending >= MAX_PENDING_EMBEDS) return Promise.reject(new EmbedderBusyError());
    this.pending++;
    const run = this.tail.then(async () => {
      const input = new this.tensor('float32', await toTensorData(image), [1, 3, CROP, CROP]);
      const output = await this.session.run({ pixel_values: input });
      const hidden = output.last_hidden_state.data as Float32Array;
      return l2normalize(Float32Array.from(hidden.subarray(0, DIM)));
    });
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.tail = settled;
    void settled.then(() => {
      this.pending--;
    });
    return run;
  }
}

export const loadOnnxEmbedder = async (
  modelPath: string | null,
  warn: (message: string) => void,
): Promise<Embedder | null> => {
  if (!modelPath) return null;
  try {
    const ort = await import('onnxruntime-node');
    return new OnnxEmbedder(await ort.InferenceSession.create(modelPath), ort.Tensor);
  } catch (error) {
    warn(`Plant recognition disabled: could not load ${modelPath} (${(error as Error).message})`);
    return null;
  }
};
