import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sharp } from 'sharp';

const factory = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('sharp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sharp')>();
  const wrapped = (...args: unknown[]) => {
    factory.calls.push(args);
    return (actual as unknown as { default: (...a: unknown[]) => unknown }).default(...args);
  };
  return { ...actual, default: wrapped };
});

import { ValidationError } from '../../../src/core/errors';
import { MatchSnapshotUseCase } from '../../../src/modules/recognition/application/MatchSnapshot';
import type { Embedder, SnapshotStore } from '../../../src/modules/recognition/domain/Recognition';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const snapshots = (): SnapshotStore => ({ put: async () => 'snap', take: () => null });
const embeddings = { vectorsForUser: async () => [] } as never;

beforeEach(() => {
  factory.calls.length = 0;
});

describe('MatchSnapshotUseCase', () => {
  it('opens the upload once and clones it for the tensor input and the snapshot webp', async () => {
    const embedDecoded = vi.fn(async (source: Sharp) => {
      await source.clone().resize(2).raw().toBuffer();
      return Float32Array.of(1);
    });
    const embed = vi.fn(async () => Float32Array.of(1));
    const embedder: Embedder = { modelId: 'm', confidentScore: 0.5, embed, embedDecoded };
    const useCase = new MatchSnapshotUseCase(embedder, embeddings, snapshots(), 1234);
    const result = await useCase.execute(1, { buffer: PNG } as never);
    expect(result.snapshotId).toBe('snap');
    expect(factory.calls).toHaveLength(1);
    expect(factory.calls[0][1]).toEqual({ limitInputPixels: 1234 });
    expect(embedDecoded).toHaveBeenCalledTimes(1);
    expect(embed).not.toHaveBeenCalled();
  });

  it('still opens the upload once when the embedder only takes encoded bytes', async () => {
    const embed = vi.fn(async () => Float32Array.of(1));
    const embedder: Embedder = { modelId: 'm', confidentScore: 0.5, embed };
    const useCase = new MatchSnapshotUseCase(embedder, embeddings, snapshots(), 1234);
    await useCase.execute(1, { buffer: PNG } as never);
    expect(factory.calls).toHaveLength(1);
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('rejects an unreadable upload as a validation error', async () => {
    const embedder: Embedder = {
      modelId: 'm',
      confidentScore: 0.5,
      embed: async () => Float32Array.of(1),
    };
    const useCase = new MatchSnapshotUseCase(embedder, embeddings, snapshots(), 1234);
    await expect(
      useCase.execute(1, { buffer: Buffer.from('nope') } as never),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
