import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { l2normalize, rankPlants } from '../../../src/modules/recognition/application/rankPlants';
import { createPixelEmbedder } from '../../../src/modules/recognition/infrastructure/PixelEmbedder';

const v = (...xs: number[]) => l2normalize(Float32Array.from(xs));

describe('rankPlants', () => {
  it('keeps the best score per plant and sorts descending', () => {
    const ranked = rankPlants(v(1, 0, 0), [
      { plantId: 1, imageId: 10, vector: v(0, 1, 0) },
      { plantId: 1, imageId: 11, vector: v(1, 0.1, 0) },
      { plantId: 2, imageId: 20, vector: v(1, 1, 0) },
    ]);
    expect(ranked.map((m) => m.plantId)).toEqual([1, 2]);
    expect(ranked[0].score).toBeGreaterThan(0.99);
  });

  it('limits the result and skips vectors of another dimension', () => {
    const vectors = Array.from({ length: 8 }, (_, i) => ({
      plantId: i,
      imageId: i,
      vector: v(1, i, 0),
    }));
    vectors.push({ plantId: 99, imageId: 99, vector: v(1, 0) });
    const ranked = rankPlants(v(1, 0, 0), vectors, 5);
    expect(ranked).toHaveLength(5);
    expect(ranked.some((m) => m.plantId === 99)).toBe(false);
  });

  it('returns nothing without vectors', () => {
    expect(rankPlants(v(1, 0, 0), [])).toEqual([]);
  });
});

describe('createPixelEmbedder', () => {
  const solid = (background: string) =>
    sharp({ create: { width: 32, height: 32, channels: 3, background } })
      .png()
      .toBuffer();
  const cosine = (a: Float32Array, b: Float32Array) => a.reduce((sum, x, i) => sum + x * b[i], 0);

  it('embeds the same image to cosine 1 and different hues apart', async () => {
    const embedder = createPixelEmbedder();
    const green = await embedder.embed(await solid('#00ff00'));
    const greenAgain = await embedder.embed(await solid('#00ff00'));
    const red = await embedder.embed(await solid('#ff0000'));
    expect(cosine(green, greenAgain)).toBeCloseTo(1, 5);
    expect(cosine(green, red)).toBeLessThan(0.9);
  });
});
