import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { ImageCleanupService } from '../../../src/modules/images/application/ImageCleanupService';
import { LocalImageStorage } from '../../../src/modules/images/infrastructure/LocalImageStorage';
import type { ImageRepository, ImageStorage } from '../../../src/modules/images/domain/Image';

const image = (id: number) => ({
  id,
  url: `http://h/uploads/plant/${id}.webp`,
  date: 1,
  entityType: 'plant' as const,
  width: 1024,
  height: 768,
  placeholder: '#336699',
  variants: 1,
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
    expect(storage.remove).toHaveBeenCalledWith('plant', image(1).url, 1);
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

describe('ImageCleanupService.purge', () => {
  it('rejects when the rows cannot be deleted and touches no file', async () => {
    const { repo, storage } = makeDeps();
    vi.mocked(repo.deleteByEntity).mockRejectedValue(new Error('db down'));
    await expect(new ImageCleanupService(repo, storage).purge('plant', 5)).rejects.toThrow(
      'db down',
    );
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('resolves when files cannot be removed after the rows are gone', async () => {
    const { repo, storage } = makeDeps();
    vi.mocked(repo.deleteByEntity).mockResolvedValue([image(1), image(2)]);
    vi.mocked(storage.remove).mockRejectedValueOnce(new Error('disk'));
    await expect(new ImageCleanupService(repo, storage).purge('plant', 5)).resolves.toBeUndefined();
    expect(storage.remove).toHaveBeenCalledTimes(2);
  });
});

describe('ImageCleanupService.removeFiles', () => {
  it('forwards the variants flag of every removed row', async () => {
    const { repo, storage } = makeDeps();
    await new ImageCleanupService(repo, storage).removeFiles([
      { entityType: 'plant', url: 'http://h/uploads/plant/a.webp', variants: 1 },
      { entityType: 'substrate', url: 'http://h/uploads/substrate/b.webp', variants: 0 },
      { entityType: 'plant', url: 'http://h/uploads/plant/c.webp' },
    ]);
    expect(storage.remove).toHaveBeenCalledWith('plant', 'http://h/uploads/plant/a.webp', 1);
    expect(storage.remove).toHaveBeenCalledWith(
      'substrate',
      'http://h/uploads/substrate/b.webp',
      0,
    );
    expect(storage.remove).toHaveBeenCalledWith(
      'plant',
      'http://h/uploads/plant/c.webp',
      undefined,
    );
  });

  it('logs and swallows file failures', async () => {
    const { repo, storage } = makeDeps();
    vi.mocked(storage.remove).mockRejectedValue(new Error('disk'));
    await expect(
      new ImageCleanupService(repo, storage).removeFiles([
        { entityType: 'plant', url: 'http://h/uploads/plant/a.webp', variants: 1 },
      ]),
    ).resolves.toBeUndefined();
  });
});

describe('LocalImageStorage.remove', () => {
  let dir: string;
  let storage: LocalImageStorage;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plantcare-remove-'));
    await fs.mkdir(path.join(dir, 'plant'));
    storage = new LocalImageStorage({ rootDir: dir });
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  const touch = (name: string) => fs.writeFile(path.join(dir, 'plant', name), 'x');
  const left = async () => (await fs.readdir(path.join(dir, 'plant'))).sort();
  const url = 'http://h/uploads/plant/a-abcdef123456.webp';

  it('removes the main file and both variants for variants = 1', async () => {
    await touch('a-abcdef123456.webp');
    await touch('a-abcdef123456-160.webp');
    await touch('a-abcdef123456-480.webp');
    await touch('other.webp');
    await storage.remove('plant', url, 1);
    expect(await left()).toEqual(['other.webp']);
  });

  it('removes only the single file for a legacy row', async () => {
    await touch('a-abcdef123456.webp');
    await touch('a-abcdef123456-160.webp');
    await storage.remove('plant', url, 0);
    expect(await left()).toEqual(['a-abcdef123456-160.webp']);
  });

  it('removes variants that exist when the flag is unknown and ignores missing files', async () => {
    await touch('a-abcdef123456.webp');
    await touch('a-abcdef123456-480.webp');
    await storage.remove('plant', url);
    expect(await left()).toEqual([]);
  });

  it('removes a legacy webp written by the old pipeline', async () => {
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ffffff' } })
      .webp()
      .toFile(path.join(dir, 'plant', 'a-abcdef123456.webp'));
    await expect(storage.remove('plant', url, 0)).resolves.toBeUndefined();
    expect(await left()).toEqual([]);
  });
});
