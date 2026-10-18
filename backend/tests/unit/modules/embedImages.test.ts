import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BACKFILL_BATCH,
  EmbedImagesService,
} from '../../../src/modules/recognition/application/EmbedImages';
import { EmbedderBusyError } from '../../../src/modules/recognition/infrastructure/OnnxEmbedder';
import type {
  Embedder,
  EmbeddingRepository,
} from '../../../src/modules/recognition/domain/Recognition';

const services: EmbedImagesService[] = [];

afterEach(() => {
  for (const service of services.splice(0)) service.stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

interface Options {
  /** Images that exist in the database; a file is written for each unless listed in `noFile`. */
  ids: number[];
  noFile?: number[];
  embed?: Embedder['embed'];
  rescanDelayMs?: number;
}

const setup = async ({ ids, noFile = [], embed, rescanDelayMs = 5 }: Options) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'embed-'));
  await mkdir(path.join(dir, 'plant'));
  for (const id of ids) {
    if (!noFile.includes(id)) {
      await writeFile(path.join(dir, 'plant', `${id}.webp`), Buffer.from('x'));
    }
  }
  const embedded = new Set<number>();
  const saves: number[] = [];
  const calls = { missing: [] as Array<[number, number]>, any: 0, count: 0 };
  const repo: EmbeddingRepository = {
    save: async (imageId) => {
      embedded.add(imageId);
      saves.push(imageId);
    },
    vectorsForUser: async () => [],
    plantImagesMissing: async (_model, limit = 50, afterId = 0) => {
      calls.missing.push([limit, afterId]);
      return ids
        .filter((id) => !embedded.has(id) && id > afterId)
        .sort((a, b) => a - b)
        .slice(0, limit)
        .map((id) => ({ imageId: id, imageUrl: `/uploads/plant/${id}.webp` }));
    },
    anyMissing: async () => {
      calls.any++;
      return ids.some((id) => !embedded.has(id));
    },
    countMissing: async () => {
      calls.count++;
      return ids.filter((id) => !embedded.has(id)).length;
    },
  };
  const embedder: Embedder = {
    modelId: 'test-model',
    confidentScore: 0.9,
    embed: embed ?? (async (b) => Float32Array.from([b.length])),
  };
  const log = { warn: vi.fn(), info: vi.fn() };
  const make = () => {
    const service = new EmbedImagesService(embedder, repo, dir, log, rescanDelayMs);
    services.push(service);
    return service;
  };
  return { service: make(), make, embedded, saves, calls, log };
};

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('EmbedImagesService', () => {
  it('backfill embeds only the missing images and never scans for orphans', async () => {
    const { service, embedded, log } = await setup({ ids: [1, 2, 3] });
    embedded.add(2);
    expect(await service.backfill()).toBe(2);
    expect([...embedded].sort()).toEqual([1, 2, 3]);
    expect(log.info).toHaveBeenCalledWith({ embedded: 2 }, expect.any(String));
  });

  it('logs and skips a missing file without failing the rest and reports it as pending', async () => {
    const { service, embedded, log } = await setup({ ids: [1, 2], noFile: [1] });
    expect(await service.backfill()).toBe(1);
    expect([...embedded]).toEqual([2]);
    expect(log.warn).toHaveBeenCalledTimes(1);
    expect(service.stats().pending).toBe(1);
  });

  it('short-circuits on EXISTS when nothing is missing', async () => {
    const { service, embedded, calls } = await setup({ ids: [1, 2] });
    embedded.add(1).add(2);
    expect(await service.backfill()).toBe(0);
    expect(calls.any).toBe(1);
    expect(calls.missing).toEqual([]);
    expect(calls.count).toBe(0);
  });

  it('reads the missing set in batches of 50 and advances past each batch', async () => {
    const { service, calls } = await setup({ ids: range(120) });
    expect(await service.backfill()).toBe(120);
    expect(BACKFILL_BATCH).toBe(50);
    expect(calls.missing).toEqual([
      [50, 0],
      [50, 50],
      [50, 100],
      [50, 120],
    ]);
  });

  it('lets a competing event loop turn run between any two embeddings', async () => {
    let turns = 0;
    let active = true;
    const tick = (): void => {
      turns++;
      if (active) setImmediate(tick);
    };
    setImmediate(tick);
    const turnsAtEmbed: number[] = [];
    const { service } = await setup({
      ids: range(12),
      embed: async (b) => {
        turnsAtEmbed.push(turns);
        return Float32Array.from([b.length]);
      },
    });
    expect(await service.backfill()).toBe(12);
    active = false;
    expect(turnsAtEmbed).toHaveLength(12);
    for (let i = 1; i < turnsAtEmbed.length; i++) {
      expect(turnsAtEmbed[i]).toBeGreaterThan(turnsAtEmbed[i - 1]);
    }
  });

  it('resumes after an interruption and embeds each image once', async () => {
    const holder: { first?: EmbedImagesService } = {};
    let count = 0;
    const { make, saves, embedded } = await setup({
      ids: range(120),
      embed: async (b) => {
        if (++count === 60) holder.first?.stop();
        return Float32Array.from([b.length]);
      },
    });
    holder.first = make();
    await holder.first.backfill();
    expect(embedded.size).toBeGreaterThanOrEqual(60);
    expect(embedded.size).toBeLessThan(120);
    await make().backfill();
    expect(embedded.size).toBe(120);
    expect(new Set(saves).size).toBe(saves.length);
  });

  it('shares one run between concurrent backfills', async () => {
    const { service, calls } = await setup({ ids: range(5) });
    const [a, b] = await Promise.all([service.backfill(), service.backfill()]);
    expect(a).toBe(5);
    expect(b).toBe(5);
    expect(calls.any).toBe(1);
  });

  it('loses nothing when the queue is full: deferred images are found by the rescan', async () => {
    const ids = range(150);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, embedded, log, saves } = await setup({
      ids,
      embed: async (b) => {
        await gate;
        return Float32Array.from([b.length]);
      },
    });
    for (const id of ids) service.enqueue(id, `/uploads/plant/${id}.webp`);
    expect(service.stats().queued).toBeLessThanOrEqual(100);
    expect(service.stats().deferred).toBeGreaterThan(0);
    expect(log.warn).toHaveBeenCalled();
    release();
    await vi.waitFor(() => expect(embedded.size).toBe(150), { timeout: 5000 });
    expect(saves).toHaveLength(150);
    expect(new Set(saves).size).toBe(150);
  });

  it('debounces the rescan across several uploads', async () => {
    const { service, calls } = await setup({ ids: [1, 2, 3], rescanDelayMs: 5_000 });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    service.enqueue(1, '/uploads/plant/1.webp');
    await vi.advanceTimersByTimeAsync(4_000);
    service.enqueue(2, '/uploads/plant/2.webp');
    await vi.advanceTimersByTimeAsync(4_000);
    service.enqueue(3, '/uploads/plant/3.webp');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls.any).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls.any).toBe(1);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls.any).toBe(1);
  });

  it('does not rescan an image that is still queued', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service, saves } = await setup({
      ids: [1, 2, 3],
      rescanDelayMs: 1,
      embed: async (b) => {
        await gate;
        return Float32Array.from([b.length]);
      },
    });
    for (const id of [1, 2, 3]) service.enqueue(id, `/uploads/plant/${id}.webp`);
    const rescan = service.backfill();
    release();
    await rescan;
    await vi.waitFor(() => expect(saves).toHaveLength(3));
    expect(new Set(saves).size).toBe(3);
  });

  it('treats a busy embedder as log-and-skip', async () => {
    const { service, saves, log } = await setup({
      ids: [1],
      embed: async () => {
        throw new EmbedderBusyError();
      },
    });
    expect(await service.embedStored(1, '/uploads/plant/1.webp')).toBe(false);
    expect(saves).toEqual([]);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('reads only the basename so a crafted url cannot leave the plant folder', async () => {
    const { service, saves, log } = await setup({ ids: [1] });
    expect(await service.embedStored(1, '/uploads/plant/../../etc/1.webp')).toBe(true);
    expect(saves).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('does not log a summary when nothing was embedded', async () => {
    const { service, log } = await setup({ ids: [] });
    expect(await service.backfill()).toBe(0);
    expect(log.info).not.toHaveBeenCalled();
  });
});
