import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

const RESIZE = 256;
const CROP = 224;
const DIM = 384;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const toTensorData = async (image: Buffer): Promise<Float32Array> => {
  const { data: resized, info } = await sharp(image)
    .rotate()
    .removeAlpha()
    .resize({ width: RESIZE, height: RESIZE, fit: 'outside', kernel: 'cubic' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = await sharp(resized, {
    raw: { width: info.width, height: info.height, channels: 3 },
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

class OnnxEmbedder implements Embedder {
  readonly modelId = 'dinov2-small-q8';
  readonly confidentScore = 0.6;
  /** Inference runs one at a time so a burst of uploads cannot starve a small machine. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly session: ort.InferenceSession) {}

  embed(image: Buffer): Promise<Float32Array> {
    const run = this.tail.then(async () => {
      const input = new ort.Tensor('float32', await toTensorData(image), [1, 3, CROP, CROP]);
      const output = await this.session.run({ pixel_values: input });
      const hidden = output.last_hidden_state.data as Float32Array;
      return l2normalize(Float32Array.from(hidden.subarray(0, DIM)));
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
}

export const loadOnnxEmbedder = async (
  modelPath: string | null,
  warn: (message: string) => void,
): Promise<Embedder | null> => {
  if (!modelPath) return null;
  try {
    return new OnnxEmbedder(await ort.InferenceSession.create(modelPath));
  } catch (error) {
    warn(`Plant recognition disabled: could not load ${modelPath} (${(error as Error).message})`);
    return null;
  }
};
