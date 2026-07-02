/**
 * tests/unit/modules/images.test.ts
 *
 * Tests for the images application layer (ImageUseCases). The most
 * important assertions here are the ordering guarantees:
 *
 *  - Update replaces the DB pointer BEFORE deleting the old file.
 *  - Delete removes the file BEFORE the metadata row.
 *
 * Both ports (repository + storage) are mocked, so these run without
 * any filesystem or SQLite.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  ImageRepository,
  ImageStorage,
  ImageRecord,
} from '../../../src/modules/images/domain/Image';
import { isEntityType } from '../../../src/modules/images/domain/Image';
import {
  UploadImageUseCase,
  ListEntityImagesUseCase,
  ServeEntityImageUseCase,
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
} from '../../../src/modules/images/application/ImageUseCases';
import { NotFoundError, ValidationError } from '../../../src/core/errors';
import multer from 'multer';
import {
  MAX_UPLOAD_BYTES,
  translateMulterError,
} from '../../../src/modules/images/presentation/uploadErrors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const makeImage = (overrides: Partial<ImageRecord> = {}): ImageRecord => ({
  id: 10,
  url: 'https://api.test/uploads/plant/old-abcd.webp',
  date: 1717236000,
  entityType: 'plant',
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
  }),
  readAsWebp: vi.fn().mockResolvedValue(Buffer.from('webp-bytes')),
  remove: vi.fn().mockResolvedValue(undefined),
});

const asMock = (fn: unknown): ReturnType<typeof vi.fn> => fn as ReturnType<typeof vi.fn>;

const file = { buffer: Buffer.from('raw'), originalName: 'IMG_1234.jpg' };
const baseUrl = 'https://api.test';

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

// ── UploadImageUseCase ────────────────────────────────────────────────────────

describe('UploadImageUseCase', () => {
  it('processes the file, builds the public URL, and persists epoch seconds', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();

    const result = await new UploadImageUseCase(repo, storage).execute({
      entityType: 'plant',
      entityId: 4,
      file,
      publicBaseUrl: baseUrl,
    });

    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    expect(result.url).toBe('https://api.test/uploads/plant/new-ef01.webp');
    expect(repo.create).toHaveBeenCalledWith('plant', 4, result.url, 1717236000);
  });
});

// ── ListEntityImagesUseCase ───────────────────────────────────────────────────

describe('ListEntityImagesUseCase', () => {
  it('throws a field-scoped ValidationError for a non-positive entityId', async () => {
    const repo = makeMockRepo();
    await expect(new ListEntityImagesUseCase(repo).execute('plant', 0)).rejects.toThrow(ValidationError);
    await expect(new ListEntityImagesUseCase(repo).execute('plant', NaN)).rejects.toThrow(ValidationError);
  });

  it('returns the entity images', async () => {
    const repo = makeMockRepo();
    asMock(repo.findByEntity).mockResolvedValue([makeImage()]);
    const images = await new ListEntityImagesUseCase(repo).execute('plant', 4);
    expect(images).toHaveLength(1);
    expect(repo.findByEntity).toHaveBeenCalledWith('plant', 4);
  });
});

// ── ServeEntityImageUseCase ───────────────────────────────────────────────────

describe('ServeEntityImageUseCase', () => {
  it('throws NotFoundError when the entity has no images', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    await expect(
      new ServeEntityImageUseCase(repo, storage).execute('plant', 4),
    ).rejects.toThrow(NotFoundError);
  });

  it('serves the primary (oldest) image with the requested width', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const oldest = makeImage({ id: 1, url: 'https://api.test/uploads/plant/a.webp' });
    const newer = makeImage({ id: 2, url: 'https://api.test/uploads/plant/b.webp' });
    asMock(repo.findByEntity).mockResolvedValue([oldest, newer]);

    const buffer = await new ServeEntityImageUseCase(repo, storage).execute('plant', 4, 256);

    expect(storage.readAsWebp).toHaveBeenCalledWith('plant', oldest.url, 256);
    expect(buffer.toString()).toBe('webp-bytes');
  });
});

// ── UpdateImageUseCase ────────────────────────────────────────────────────────

describe('UpdateImageUseCase', () => {
  it('throws ValidationError when neither file nor date is provided', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    await expect(
      new UpdateImageUseCase(repo, storage).execute({ imageId: 10, publicBaseUrl: baseUrl }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError for a missing image', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    await expect(
      new UpdateImageUseCase(repo, storage).execute({
        imageId: 999,
        date: '2024-06-01T10:00:00.000Z',
        publicBaseUrl: baseUrl,
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws a field-scoped ValidationError for an unparsable date', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    asMock(repo.findById).mockResolvedValue(makeImage());
    await expect(
      new UpdateImageUseCase(repo, storage).execute({
        imageId: 10,
        date: 'garbage',
        publicBaseUrl: baseUrl,
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('deletes the old file only AFTER the database points at the new one', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const existing = makeImage();
    const updated = makeImage({ url: 'https://api.test/uploads/plant/new-ef01.webp' });
    asMock(repo.findById)
      .mockResolvedValueOnce(existing) // pre-update load
      .mockResolvedValueOnce(updated); // read-back

    const record = await new UpdateImageUseCase(repo, storage).execute({
      imageId: 10,
      file,
      publicBaseUrl: baseUrl,
    });

    // New file processed under the EXISTING entity type
    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    // DB update carries the new URL
    expect(repo.update).toHaveBeenCalledWith(10, {
      imageUrl: 'https://api.test/uploads/plant/new-ef01.webp',
      uploadDate: undefined,
    });
    // Old file removed — and strictly after the DB update
    expect(storage.remove).toHaveBeenCalledWith('plant', existing.url);
    const updateOrder = asMock(repo.update).mock.invocationCallOrder[0];
    const removeOrder = asMock(storage.remove).mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(removeOrder);

    expect(record.url).toBe(updated.url);
  });

  it('does not touch storage for a date-only update', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    asMock(repo.findById).mockResolvedValue(makeImage());

    await new UpdateImageUseCase(repo, storage).execute({
      imageId: 10,
      date: 1717236000000,
      publicBaseUrl: baseUrl,
    });

    expect(repo.update).toHaveBeenCalledWith(10, { imageUrl: undefined, uploadDate: 1717236000 });
    expect(storage.processUpload).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

// ── DeleteImageUseCase ────────────────────────────────────────────────────────

describe('DeleteImageUseCase', () => {
  it('throws NotFoundError for a missing image', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    await expect(new DeleteImageUseCase(repo, storage).execute(999)).rejects.toThrow(NotFoundError);
  });

  it('removes the file before the metadata row', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const image = makeImage();
    asMock(repo.findById).mockResolvedValue(image);

    await new DeleteImageUseCase(repo, storage).execute(10);

    expect(storage.remove).toHaveBeenCalledWith('plant', image.url);
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
    const a = makeImage({ id: 1, url: 'https://api.test/uploads/plant/a.webp' });
    const b = makeImage({ id: 2, url: 'https://api.test/uploads/plant/b.webp' });
    asMock(repo.deleteByEntity).mockResolvedValue([a, b]);

    await new DeleteEntityImagesUseCase(repo, storage).execute('plant', 4);

    expect(repo.deleteByEntity).toHaveBeenCalledWith('plant', 4);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith('plant', a.url);
    expect(storage.remove).toHaveBeenCalledWith('plant', b.url);
  });
});

// ── translateMulterError ──────────────────────────────────────────────────────

describe('translateMulterError', () => {
  it('maps LIMIT_FILE_SIZE to a ValidationError naming the cap', () => {
    const out = translateMulterError(new multer.MulterError('LIMIT_FILE_SIZE'));
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toContain(
      `${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
    );
  });

  it('maps other Multer errors to a generic upload ValidationError', () => {
    const out = translateMulterError(
      new multer.MulterError('LIMIT_UNEXPECTED_FILE'),
    );
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toContain('Upload failed');
  });

  it('passes non-Multer errors through unchanged', () => {
    const err = new Error('boom');
    expect(translateMulterError(err)).toBe(err);
  });
});
