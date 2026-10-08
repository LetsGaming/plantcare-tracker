import { describe, it, expect, vi } from 'vitest';
import { ImageCleanupService } from '../../../src/modules/images/application/ImageCleanupService';
import type { ImageRepository, ImageStorage } from '../../../src/modules/images/domain/Image';

const image = (id: number) => ({
  id,
  url: `http://h/uploads/plant/${id}.webp`,
  date: 1,
  entityType: 'plant' as const,
});

const makeDeps = () => {
  const repo = { deleteByEntity: vi.fn() } as unknown as ImageRepository;
  const storage = { remove: vi.fn().mockResolvedValue(undefined) } as unknown as ImageStorage;
  return { repo, storage };
};

describe('ImageCleanupService', () => {
  it('deletes the rows and then every file', async () => {
    const { repo, storage } = makeDeps();
    vi.mocked(repo.deleteByEntity).mockResolvedValue([image(1), image(2)]);

    await new ImageCleanupService(repo, storage).removeAll('plant', 5);

    expect(repo.deleteByEntity).toHaveBeenCalledWith('plant', 5);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith('plant', image(1).url);
  });

  it('never throws, because the entity is already deleted', async () => {
    const { repo, storage } = makeDeps();
    vi.mocked(repo.deleteByEntity).mockRejectedValue(new Error('db down'));
    await expect(
      new ImageCleanupService(repo, storage).removeAll('plant', 5),
    ).resolves.toBeUndefined();

    vi.mocked(repo.deleteByEntity).mockResolvedValue([image(1)]);
    vi.mocked(storage.remove).mockRejectedValue(new Error('disk'));
    await expect(
      new ImageCleanupService(repo, storage).removeAll('plant', 5),
    ).resolves.toBeUndefined();
  });
});
