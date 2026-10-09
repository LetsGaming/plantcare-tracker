import sharp from 'sharp';
import type { Embedder } from '../domain/Recognition';
import { l2normalize } from '../application/rankPlants';

export const createPixelEmbedder = (): Embedder => ({
  modelId: 'pixel-16',
  confidentScore: 0.97,
  async embed(image: Buffer): Promise<Float32Array> {
    const raw = await sharp(image)
      .rotate()
      .removeAlpha()
      .resize(16, 16, { fit: 'fill' })
      .raw()
      .toBuffer();
    return l2normalize(Float32Array.from(raw, (byte) => byte / 255));
  },
});
