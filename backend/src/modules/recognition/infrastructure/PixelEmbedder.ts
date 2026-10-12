import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

const MAX_INPUT_PIXELS = 64_000_000;

export const createPixelEmbedder = (limitInputPixels = MAX_INPUT_PIXELS): Embedder => ({
  modelId: 'pixel-16',
  confidentScore: 0.97,
  async embed(image: Buffer): Promise<Float32Array> {
    const raw = await sharp(image, { limitInputPixels })
      .rotate()
      .removeAlpha()
      .resize(16, 16, { fit: 'fill' })
      .raw()
      .toBuffer();
    return l2normalize(Float32Array.from(raw, (byte) => byte / 255));
  },
});
