import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EmbedImagesService } from '../../../src/modules/recognition/application/EmbedImages';
import { EmbedderBusyError } from '../../../src/modules/recognition/infrastructure/OnnxEmbedder';
import type {
  Embedder,
  EmbeddingRepository,
  MissingImage,
} from '../../../src/modules/recognition/domain/Recognition';

const setup = async (files: string[], missing: MissingImage[], embed?: Embedder['embed']) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
  await mkdir(path.join(dir, 'plant'));
  for (const f of files) await writeFile(path.join(dir, 'plant', f), Buffer.from(f));
  const calls: string[] = [];
  const saved: Array<{ imageId: number; model: string; vector: Float32Array }> = [];
  const repo: EmbeddingRepository = {
    save: async (imageId, model, vector) => {
      calls.push('save');
      saved.push({ imageId, model, vector });
    },
    vectorsForUser: async () => [],
    plantImagesMissing: async () => {
      calls.push('missing');
      return missing;
    },
    purgeOrphans: async () => {
      calls.push('purge');
    },
  };
  const embedder: Embedder = {
    modelId: 'test-model',
    confidentScore: 0.9,
    embed: embed ?? (async (b) => Float32Array.from([b.length])),
  };
  const log = { warn: vi.fn(), info: vi.fn() };
  return { service: new EmbedImagesService(embedder, repo, dir, log), calls, saved, log };
};

describe('EmbedImagesService', () => {
  it('backfill purges orphans first and embeds only the missing images', async () => {
    const { service, calls, saved, log } = await setup(
      ['a.webp', 'b.webp'],
      [
        { imageId: 1, imageUrl: '/uploads/plant/a.webp' },
        { imageId: 2, imageUrl: '/uploads/plant/b.webp' },
      ],
    );
    expect(await service.backfill()).toBe(2);
    expect(calls[0]).toBe('purge');
    expect(saved.map((s) => [s.imageId, s.model])).toEqual([
      [1, 'test-model'],
      [2, 'test-model'],
    ]);
    expect(log.info).toHaveBeenCalledWith({ embedded: 2 }, expect.any(String));
  });

  it('logs and skips a missing file without failing the rest', async () => {
    const { service, saved, log } = await setup(
      ['b.webp'],
      [
        { imageId: 1, imageUrl: '/uploads/plant/gone.webp' },
        { imageId: 2, imageUrl: '/uploads/plant/b.webp' },
      ],
    );
    expect(await service.backfill()).toBe(1);
    expect(saved.map((s) => s.imageId)).toEqual([2]);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('treats a busy embedder as log-and-skip', async () => {
    const { service, saved, log } = await setup(['a.webp'], [], async () => {
      throw new EmbedderBusyError();
    });
    expect(await service.embedStored(1, '/uploads/plant/a.webp')).toBe(false);
    expect(saved).toEqual([]);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('reads only the basename so a crafted url cannot leave the plant folder', async () => {
    const { service, saved, log } = await setup(['a.webp'], []);
    expect(await service.embedStored(1, '/uploads/plant/../../etc/a.webp')).toBe(true);
    expect(saved).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('does not log a summary when nothing was embedded', async () => {
    const { service, log } = await setup([], []);
    expect(await service.backfill()).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
  });
});
