/**
 * tests/unit/modules/images.test.ts
 *
 * Tests for the images application layer (ImageUseCases, ImageAccessPolicy).
 * The most important assertions here are:
 *
 *  - Update replaces the DB pointer BEFORE deleting the old file.
 *  - Delete removes the file BEFORE the metadata row.
 *  - Every use case asks the access policy before doing any work.
 *
 * The ports (repository, storage, entity lookup) are mocked, so these run
 * without any filesystem or SQLite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import type {
  ImageActor,
  ImageEntityInfo,
  ImageEntityLookup,
  ImageRepository,
  ImageStorage,
  StoredImage,
} from '../../../src/modules/images/domain/Image';
import { isEntityType } from '../../../src/modules/images/domain/Image';
import {
  UploadImageUseCase,
  ListEntityImagesUseCase,
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
} from '../../../src/modules/images/application/ImageUseCases';
import { LocalImageStorage } from '../../../src/modules/images/infrastructure/LocalImageStorage';
import { createSemaphore } from '../../../src/modules/images/infrastructure/semaphore';
import { ImageAccessPolicy } from '../../../src/modules/images/application/ImageAccessPolicy';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/core/errors';
import {
  MAX_UPLOAD_BYTES,
  translateUploadError,
} from '../../../src/modules/images/presentation/uploadErrors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const actor: ImageActor = { id: 7, role: 'user' };

const makeImage = (overrides: Partial<StoredImage> = {}): StoredImage => ({
  id: 10,
  url: 'https://api.test/uploads/plant/old-abcd.webp',
  date: 1717236000,
  entityType: 'plant',
  entityId: 4,
  width: 1024,
  height: 768,
  placeholder: '#336699',
  variants: 1,
  ...overrides,
});

const makeMockRepo = (): ImageRepository => ({
  findByEntity: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue(10),
  update: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
  deleteByEntity: vi.fn().mockResolvedValue([]),
});

const makeMockStorage = (): ImageStorage => ({
  processUpload: vi.fn().mockResolvedValue({
    filename: 'new-ef01.webp',
    capturedAt: new Date('2024-06-01T10:00:00.000Z'),
    width: 1024,
    height: 768,
    placeholder: '#336699',
    variants: 1,
  }),
  remove: vi.fn().mockResolvedValue(undefined),
});

/** A policy that allows everything and records its calls. */
const makeAllowAll = () => {
  const assertCanView = vi.fn().mockResolvedValue(undefined);
  const assertCanModify = vi.fn().mockResolvedValue(undefined);
  return {
    policy: { assertCanView, assertCanModify } as unknown as ImageAccessPolicy,
    assertCanView,
    assertCanModify,
  };
};

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

const file = { buffer: Buffer.from('raw'), originalName: 'IMG_1234.jpg' };

// ── Domain guard ──────────────────────────────────────────────────────────────

describe('isEntityType', () => {
  it('accepts the three known entity types', () => {
    expect(isEntityType('plant')).toBe(true);
    expect(isEntityType('substrate')).toBe(true);
    expect(isEntityType('component')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isEntityType('user')).toBe(false);
    expect(isEntityType('')).toBe(false);
  });
});

// ── ImageAccessPolicy ─────────────────────────────────────────────────────────

describe('ImageAccessPolicy', () => {
  const lookupOf = (info: ImageEntityInfo | null): ImageEntityLookup => ({
    find: vi.fn().mockResolvedValue(info),
  });
  const policyFor = (info: ImageEntityInfo | null) => new ImageAccessPolicy(lookupOf(info));

  it('lets the owner view and modify a private plant', async () => {
    const policy = policyFor({ ownerId: 7, isPublic: false });
    await expect(policy.assertCanView('plant', 4, actor)).resolves.toBeUndefined();
    await expect(policy.assertCanModify('plant', 4, actor)).resolves.toBeUndefined();
  });

  it('lets others view a public plant but not modify it', async () => {
    const policy = policyFor({ ownerId: 99, isPublic: true });
    await expect(policy.assertCanView('plant', 4, actor)).resolves.toBeUndefined();
    await expect(policy.assertCanModify('plant', 4, actor)).rejects.toThrow(ForbiddenError);
  });

  it("hides another user's private entity behind a 404", async () => {
    const policy = policyFor({ ownerId: 99, isPublic: false });
    await expect(policy.assertCanView('substrate', 4, actor)).rejects.toThrow(NotFoundError);
    await expect(policy.assertCanModify('substrate', 4, actor)).rejects.toThrow(NotFoundError);
  });

  it('answers 404 for an entity that does not exist', async () => {
    const policy = policyFor(null);
    await expect(policy.assertCanView('plant', 4, actor)).rejects.toThrow('Plant not found');
    await expect(policy.assertCanModify('component', 4, actor)).rejects.toThrow(
      'Component not found',
    );
  });

  it('lets only admins modify the component catalogue and everyone view it', async () => {
    const policy = policyFor({ ownerId: null, isPublic: true });
    await expect(policy.assertCanView('component', 4, actor)).resolves.toBeUndefined();
    await expect(policy.assertCanModify('component', 4, actor)).rejects.toThrow(ForbiddenError);
    await expect(
      policy.assertCanModify('component', 4, { id: 1, role: 'Admin' }),
    ).resolves.toBeUndefined();
  });

  it('does not let an admin modify a regular user plant', async () => {
    const policy = policyFor({ ownerId: 99, isPublic: true });
    await expect(policy.assertCanModify('plant', 4, { id: 1, role: 'admin' })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

// ── UploadImageUseCase ────────────────────────────────────────────────────────

describe('UploadImageUseCase', () => {
  it('processes the file, stores the origin-free path, returns the public URL, and persists epoch seconds', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();

    const result = await new UploadImageUseCase(repo, storage, policy).execute({
      actor,
      entityType: 'plant',
      entityId: 4,
      file,
    });

    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    expect(result.url).toBe('http://localhost:5000/uploads/plant/new-ef01.webp');
    expect(repo.create).toHaveBeenCalledWith(
      'plant',
      4,
      '/uploads/plant/new-ef01.webp',
      1717236000,
      { width: 1024, height: 768, placeholder: '#336699', variants: 1 },
    );
  });

  it('checks modify access before touching storage or the database', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanModify } = makeAllowAll();
    assertCanModify.mockRejectedValue(new ForbiddenError('no'));

    await expect(
      new UploadImageUseCase(repo, storage, policy).execute({
        actor,
        entityType: 'plant',
        entityId: 4,
        file,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(assertCanModify).toHaveBeenCalledWith('plant', 4, actor);
    expect(storage.processUpload).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });
});

// ── ListEntityImagesUseCase ───────────────────────────────────────────────────

describe('ListEntityImagesUseCase', () => {
  it('throws a field-scoped ValidationError for a non-positive entityId', async () => {
    const repo = makeMockRepo();
    const { policy } = makeAllowAll();
    await expect(
      new ListEntityImagesUseCase(repo, policy).execute('plant', 0, actor),
    ).rejects.toThrow(ValidationError);
    await expect(
      new ListEntityImagesUseCase(repo, policy).execute('plant', NaN, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('returns the entity images after the view check', async () => {
    const repo = makeMockRepo();
    const { policy, assertCanView } = makeAllowAll();
    asMock(repo.findByEntity).mockResolvedValue([makeImage()]);
    const images = await new ListEntityImagesUseCase(repo, policy).execute('plant', 4, actor);
    expect(images).toHaveLength(1);
    expect(assertCanView).toHaveBeenCalledWith('plant', 4, actor);
    expect(repo.findByEntity).toHaveBeenCalledWith('plant', 4);
  });

  it('does not query images for an entity the caller cannot view', async () => {
    const repo = makeMockRepo();
    const { policy, assertCanView } = makeAllowAll();
    assertCanView.mockRejectedValue(new NotFoundError('Plant'));
    await expect(
      new ListEntityImagesUseCase(repo, policy).execute('plant', 4, actor),
    ).rejects.toThrow(NotFoundError);
    expect(repo.findByEntity).not.toHaveBeenCalled();
  });
});

// ── UpdateImageUseCase ────────────────────────────────────────────────────────

describe('UpdateImageUseCase', () => {
  it('throws ValidationError when neither file nor date is provided', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    await expect(
      new UpdateImageUseCase(repo, storage, policy).execute({
        actor,
        imageId: 10,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError for a missing image', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    await expect(
      new UpdateImageUseCase(repo, storage, policy).execute({
        actor,
        imageId: 999,
        date: '2024-06-01T10:00:00.000Z',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('checks modify access against the entity the image belongs to', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanModify } = makeAllowAll();
    assertCanModify.mockRejectedValue(new ForbiddenError('no'));
    asMock(repo.findById).mockResolvedValue(makeImage({ entityType: 'substrate', entityId: 9 }));

    await expect(
      new UpdateImageUseCase(repo, storage, policy).execute({
        actor,
        imageId: 10,
        date: 1717236000000,
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(assertCanModify).toHaveBeenCalledWith('substrate', 9, actor);
    expect(repo.update).not.toHaveBeenCalled();
    expect(storage.processUpload).not.toHaveBeenCalled();
  });

  it('throws a field-scoped ValidationError for an unparsable date', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    asMock(repo.findById).mockResolvedValue(makeImage());
    await expect(
      new UpdateImageUseCase(repo, storage, policy).execute({
        actor,
        imageId: 10,
        date: 'garbage',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('deletes the old file only AFTER the database points at the new one', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    const existing = makeImage();
    const updated = makeImage({ url: 'https://api.test/uploads/plant/new-ef01.webp' });
    asMock(repo.findById)
      .mockResolvedValueOnce(existing) // pre-update load
      .mockResolvedValueOnce(updated); // read-back

    const record = await new UpdateImageUseCase(repo, storage, policy).execute({
      actor,
      imageId: 10,
      file,
    });

    // New file processed under the EXISTING entity type
    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    // DB update carries the new URL
    expect(repo.update).toHaveBeenCalledWith(10, {
      imageUrl: '/uploads/plant/new-ef01.webp',
      uploadDate: undefined,
      width: 1024,
      height: 768,
      placeholder: '#336699',
      variants: 1,
    });
    // Old file removed (with its variants), and strictly after the DB update
    expect(storage.remove).toHaveBeenCalledWith('plant', existing.url, 1);
    const updateOrder = asMock(repo.update).mock.invocationCallOrder[0];
    const removeOrder = asMock(storage.remove).mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(removeOrder);

    expect(record.url).toBe(updated.url);
  });

  it('does not expose the internal entity id in the returned record', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    asMock(repo.findById).mockResolvedValue(makeImage());
    const record = await new UpdateImageUseCase(repo, storage, policy).execute({
      actor,
      imageId: 10,
      date: 1717236000000,
    });
    expect(Object.keys(record).sort()).toEqual([
      'date',
      'entityType',
      'height',
      'id',
      'placeholder',
      'url',
      'variants',
      'width',
    ]);
  });

  it('does not touch storage for a date-only update', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    asMock(repo.findById).mockResolvedValue(makeImage());

    await new UpdateImageUseCase(repo, storage, policy).execute({
      actor,
      imageId: 10,
      date: 1717236000000,
    });

    expect(repo.update).toHaveBeenCalledWith(10, { imageUrl: undefined, uploadDate: 1717236000 });
    expect(storage.processUpload).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

// ── DeleteImageUseCase ────────────────────────────────────────────────────────

describe('DeleteImageUseCase', () => {
  it('passes the legacy variants flag so only the single file is removed', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    const legacy = makeImage({ variants: 0, width: null, height: null, placeholder: null });
    asMock(repo.findById).mockResolvedValue(legacy);
    await new DeleteImageUseCase(repo, storage, policy).execute(10, actor);
    expect(storage.remove).toHaveBeenCalledWith('plant', legacy.url, 0);
  });

  it('throws NotFoundError for a missing image', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    await expect(new DeleteImageUseCase(repo, storage, policy).execute(999, actor)).rejects.toThrow(
      NotFoundError,
    );
  });

  it('checks modify access and leaves file and row alone when refused', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanModify } = makeAllowAll();
    assertCanModify.mockRejectedValue(new ForbiddenError('no'));
    asMock(repo.findById).mockResolvedValue(makeImage());
    await expect(new DeleteImageUseCase(repo, storage, policy).execute(10, actor)).rejects.toThrow(
      ForbiddenError,
    );
    expect(assertCanModify).toHaveBeenCalledWith('plant', 4, actor);
    expect(storage.remove).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('removes the file before the metadata row', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    const image = makeImage();
    asMock(repo.findById).mockResolvedValue(image);

    await new DeleteImageUseCase(repo, storage, policy).execute(10, actor);

    expect(storage.remove).toHaveBeenCalledWith('plant', image.url, 1);
    expect(repo.delete).toHaveBeenCalledWith(10);
    const removeOrder = asMock(storage.remove).mock.invocationCallOrder[0];
    const deleteOrder = asMock(repo.delete).mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(deleteOrder);
  });
});

// ── DeleteEntityImagesUseCase ─────────────────────────────────────────────────

describe('DeleteEntityImagesUseCase', () => {
  it('removes every file the repository reported as deleted', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanModify } = makeAllowAll();
    const a = makeImage({ id: 1, url: 'https://api.test/uploads/plant/a.webp' });
    const b = makeImage({ id: 2, url: 'https://api.test/uploads/plant/b.webp' });
    asMock(repo.deleteByEntity).mockResolvedValue([a, b]);

    await new DeleteEntityImagesUseCase(repo, storage, policy).execute('plant', 4, actor);

    expect(assertCanModify).toHaveBeenCalledWith('plant', 4, actor);
    expect(repo.deleteByEntity).toHaveBeenCalledWith('plant', 4);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith('plant', a.url, 1);
    expect(storage.remove).toHaveBeenCalledWith('plant', b.url, 1);
  });

  it('deletes nothing when the caller may not modify the entity', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanModify } = makeAllowAll();
    assertCanModify.mockRejectedValue(new ForbiddenError('no'));
    await expect(
      new DeleteEntityImagesUseCase(repo, storage, policy).execute('plant', 4, actor),
    ).rejects.toThrow(ForbiddenError);
    expect(repo.deleteByEntity).not.toHaveBeenCalled();
  });
});

// ── translateUploadError ──────────────────────────────────────────────────────

const parserError = (code: string, message = 'parser failure') =>
  Object.assign(new Error(message), { code });

describe('translateUploadError', () => {
  it('maps an oversized file to a ValidationError naming the cap', () => {
    const out = translateUploadError(parserError('FST_REQ_FILE_TOO_LARGE'));
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toContain(`${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  });

  it('maps other multipart parser errors to a generic upload ValidationError', () => {
    const out = translateUploadError(parserError('FST_FILES_LIMIT', 'too many files'));
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toBe('Upload failed: too many files');
  });

  it('passes other errors through unchanged', () => {
    const err = new Error('boom');
    expect(translateUploadError(err)).toBe(err);
  });
});

// ── LocalImageStorage pipeline ────────────────────────────────────────────────

describe('LocalImageStorage.processUpload', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'plantcare-pipeline-'));
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  const solid = (width: number, height: number, colour: string) =>
    sharp({ create: { width, height, channels: 3, background: colour } });

  const metaOf = (name: string) => sharp(path.join(dir, 'plant', name)).metadata();

  it('writes three webp variants with the expected widths and returns dimensions and placeholder', async () => {
    const buffer = await solid(2000, 1000, '#336699').jpeg().toBuffer();
    const storage = new LocalImageStorage({ rootDir: dir, maxInputPixels: 40_000_000 });
    const result = await storage.processUpload({ buffer, originalName: 'Leaf.jpg' }, 'plant');

    const base = result.filename.replace(/\.webp$/, '');
    expect((await fs.readdir(path.join(dir, 'plant'))).sort()).toEqual(
      [`${base}-160.webp`, `${base}-480.webp`, `${base}.webp`].sort(),
    );
    expect((await metaOf(`${base}-160.webp`)).width).toBe(160);
    expect((await metaOf(`${base}-480.webp`)).width).toBe(480);
    expect((await metaOf(`${base}.webp`)).width).toBe(1024);
    expect(result).toMatchObject({ width: 1024, height: 512, variants: 1 });
    expect(result.placeholder).toMatch(/^#[0-9a-f]{6}$/);
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    expect(Math.abs(channel(result.placeholder!, 0) - 0x33)).toBeLessThan(24);
    expect(Math.abs(channel(result.placeholder!, 2) - 0x99)).toBeLessThan(24);
  });

  it('applies EXIF orientation 6: variants are upright with swapped dimensions and no metadata', async () => {
    const raw = Buffer.alloc(200 * 100 * 3, 120);
    const buffer = await sharp(raw, { raw: { width: 200, height: 100, channels: 3 } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(buffer).metadata()).orientation).toBe(6);

    const storage = new LocalImageStorage({ rootDir: dir, maxInputPixels: 40_000_000 });
    const result = await storage.processUpload({ buffer, originalName: 'photo.jpg' }, 'plant');

    expect(result.width).toBe(100);
    expect(result.height).toBe(200);
    const base = result.filename.replace(/\.webp$/, '');
    for (const name of [`${base}-160.webp`, `${base}-480.webp`, `${base}.webp`]) {
      const meta = await metaOf(name);
      expect(meta.height).toBeGreaterThan(meta.width!);
      expect(meta.orientation).toBeUndefined();
      expect(meta.exif).toBeUndefined();
    }
  });

  it('rejects an image over the pixel cap with a ValidationError and leaves no files', async () => {
    const buffer = await solid(200, 200, '#ffffff').png().toBuffer();
    const storage = new LocalImageStorage({ rootDir: dir, maxInputPixels: 10_000 });
    const error = await storage
      .processUpload({ buffer, originalName: 'big.png' }, 'plant')
      .catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toMatch(/too many pixels/);
    expect(await fs.readdir(path.join(dir, 'plant'))).toEqual([]);
  });

  it('rejects bytes that are not an image', async () => {
    const storage = new LocalImageStorage({ rootDir: dir, maxInputPixels: 40_000_000 });
    await expect(
      storage.processUpload({ buffer: Buffer.from('nope'), originalName: 'a.png' }, 'plant'),
    ).rejects.toThrow('The uploaded file is not a valid image.');
  });

  it('gives two uploads of the same file name different stored names', async () => {
    const buffer = await solid(10, 10, '#abcdef').png().toBuffer();
    const storage = new LocalImageStorage({ rootDir: dir, maxInputPixels: 40_000_000 });
    const [a, b] = await Promise.all([
      storage.processUpload({ buffer, originalName: 'same.png' }, 'plant'),
      storage.processUpload({ buffer, originalName: 'same.png' }, 'plant'),
    ]);
    expect(a.filename).not.toBe(b.filename);
  });
});

describe('createSemaphore', () => {
  it('never runs more than the limit at once and starts queued tasks in order', async () => {
    const semaphore = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const started: number[] = [];
    const task = (id: number) =>
      semaphore.run(async () => {
        started.push(id);
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        return id;
      });

    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(task));

    expect(results).toEqual([1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('releases the slot when a task fails', async () => {
    const semaphore = createSemaphore(1);
    await expect(semaphore.run(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(semaphore.run(async () => 'ok')).resolves.toBe('ok');
  });
});
