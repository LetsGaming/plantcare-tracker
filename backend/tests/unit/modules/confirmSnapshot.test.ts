import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfirmSnapshotUseCase } from '../../../src/modules/recognition/application/ConfirmSnapshot';
import type {
  EmbeddingRepository,
  PendingSnapshot,
  SnapshotStore,
} from '../../../src/modules/recognition/domain/Recognition';
import type { ImageRepository } from '../../../src/modules/images/domain/Image';
import type { CreateWateringRecordUseCase } from '../../../src/modules/watering/application/WateringUseCases';

afterEach(() => vi.restoreAllMocks());

interface Opts {
  createImage?: () => Promise<number>;
  saveEmbedding?: () => Promise<void>;
  missingSnapshotFile?: boolean;
}

const setup = async (opts: Opts = {}) => {
  const uploads = await mkdtemp(path.join(tmpdir(), 'confirm-up-'));
  const snapDir = await mkdtemp(path.join(tmpdir(), 'confirm-snap-'));
  const pending = new Map<string, PendingSnapshot>();
  const addSnapshot = async (id: string) => {
    const file = path.join(snapDir, `${id}.webp`);
    if (!opts.missingSnapshotFile) await writeFile(file, id);
    pending.set(id, { userId: 1, path: file, vector: Float32Array.from([1]), expiresAt: 1e15 });
  };
  const snapshots: SnapshotStore = {
    put: async () => 'unused',
    take: (id, userId) => {
      const snap = pending.get(id);
      if (!snap || snap.userId !== userId) return null;
      pending.delete(id);
      return snap;
    },
  };
  const rows = new Map<number, string>();
  let nextId = 1;
  const images = {
    create: async (_t: string, _e: number, url: string) => {
      if (opts.createImage) return opts.createImage();
      rows.set(nextId, url);
      return nextId++;
    },
    delete: async (id: number) => {
      rows.delete(id);
    },
  } as unknown as ImageRepository;
  const embeddings = {
    save: async () => {
      if (opts.saveEmbedding) await opts.saveEmbedding();
    },
  } as unknown as EmbeddingRepository;
  const watering = {
    execute: async () => ({ record_id: 7 }),
  } as unknown as CreateWateringRecordUseCase;
  const log = { warn: vi.fn(), info: vi.fn() };
  const useCase = new ConfirmSnapshotUseCase(
    watering,
    images,
    embeddings,
    snapshots,
    'm',
    uploads,
    log,
  );
  const files = async () => readdir(path.join(uploads, 'plant')).catch(() => [] as string[]);
  return { useCase, addSnapshot, rows, files, log };
};

describe('ConfirmSnapshotUseCase photo handling', () => {
  it('returns a null imageId and leaves no file or row when the image row cannot be created', async () => {
    const { useCase, addSnapshot, rows, files, log } = await setup({
      createImage: async () => {
        throw new Error('db down');
      },
    });
    await addSnapshot('s1');
    await expect(useCase.execute(1, 's1', { plantId: 3 })).resolves.toEqual({
      recordId: 7,
      imageId: null,
    });
    expect(rows.size).toBe(0);
    expect(await files()).toEqual([]);
    expect(log.warn).toHaveBeenCalled();
  });

  it('keeps the photo and its id when only the embedding fails', async () => {
    const { useCase, addSnapshot, rows, files, log } = await setup({
      saveEmbedding: async () => {
        throw new Error('embed fail');
      },
    });
    await addSnapshot('s1');
    const result = await useCase.execute(1, 's1', { plantId: 3 });
    expect(result).toEqual({ recordId: 7, imageId: 1 });
    expect(rows.size).toBe(1);
    expect(await files()).toHaveLength(1);
    expect(log.warn).toHaveBeenCalled();
  });

  it('returns a null imageId and no row when the snapshot file cannot be copied', async () => {
    const { useCase, addSnapshot, rows } = await setup({ missingSnapshotFile: true });
    await addSnapshot('s1');
    const result = await useCase.execute(1, 's1', { plantId: 3 });
    expect(result).toEqual({ recordId: 7, imageId: null });
    expect(rows.size).toBe(0);
  });

  it('writes distinct files and urls for confirms in the same millisecond', async () => {
    const { useCase, addSnapshot, rows, files } = await setup();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    await addSnapshot('s1');
    await addSnapshot('s2');
    const a = await useCase.execute(1, 's1', { plantId: 3 });
    const b = await useCase.execute(1, 's2', { plantId: 4 });
    expect(a.imageId).not.toBeNull();
    expect(b.imageId).not.toBeNull();
    expect(await files()).toHaveLength(2);
    expect(new Set(rows.values()).size).toBe(2);
  });
});
