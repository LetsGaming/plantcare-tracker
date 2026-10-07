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

import { describe, it, expect, vi } from 'vitest';
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
  ServeEntityImageUseCase,
  UpdateImageUseCase,
  DeleteImageUseCase,
  DeleteEntityImagesUseCase,
} from '../../../src/modules/images/application/ImageUseCases';
import { ImageAccessPolicy } from '../../../src/modules/images/application/ImageAccessPolicy';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/core/errors';
import multer from 'multer';
import {
  MAX_UPLOAD_BYTES,
  translateMulterError,
} from '../../../src/modules/images/presentation/uploadErrors';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const actor: ImageActor = { id: 7, role: 'user' };

const makeImage = (overrides: Partial<StoredImage> = {}): StoredImage => ({
  id: 10,
  url: 'https://api.test/uploads/plant/old-abcd.webp',
  date: 1717236000,
  entityType: 'plant',
  entityId: 4,
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
  it('processes the file, builds the public URL, and persists epoch seconds', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();

    const result = await new UploadImageUseCase(repo, storage, policy).execute({
      actor,
      entityType: 'plant',
      entityId: 4,
      file,
      publicBaseUrl: baseUrl,
    });

    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    expect(result.url).toBe('https://api.test/uploads/plant/new-ef01.webp');
    expect(repo.create).toHaveBeenCalledWith('plant', 4, result.url, 1717236000);
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
        publicBaseUrl: baseUrl,
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

// ── ServeEntityImageUseCase ───────────────────────────────────────────────────

describe('ServeEntityImageUseCase', () => {
  it('throws NotFoundError when the entity has no images', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy } = makeAllowAll();
    await expect(
      new ServeEntityImageUseCase(repo, storage, policy).execute('plant', 4, actor),
    ).rejects.toThrow(NotFoundError);
  });

  it('serves the primary (oldest) image with the requested width', async () => {
    const repo = makeMockRepo();
    const storage = makeMockStorage();
    const { policy, assertCanView } = makeAllowAll();
    const oldest = makeImage({ id: 1, url: 'https://api.test/uploads/plant/a.webp' });
    const newer = makeImage({ id: 2, url: 'https://api.test/uploads/plant/b.webp' });
    asMock(repo.findByEntity).mockResolvedValue([oldest, newer]);

    const buffer = await new ServeEntityImageUseCase(repo, storage, policy).execute(
      'plant',
      4,
      actor,
      256,
    );

    expect(assertCanView).toHaveBeenCalledWith('plant', 4, actor);
    expect(storage.readAsWebp).toHaveBeenCalledWith('plant', oldest.url, 256);
    expect(buffer.toString()).toBe('webp-bytes');
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
        publicBaseUrl: baseUrl,
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
        publicBaseUrl: baseUrl,
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
        publicBaseUrl: baseUrl,
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
        publicBaseUrl: baseUrl,
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
      publicBaseUrl: baseUrl,
    });

    // New file processed under the EXISTING entity type
    expect(storage.processUpload).toHaveBeenCalledWith(file, 'plant');
    // DB update carries the new URL
    expect(repo.update).toHaveBeenCalledWith(10, {
      imageUrl: 'https://api.test/uploads/plant/new-ef01.webp',
      uploadDate: undefined,
    });
    // Old file removed, and strictly after the DB update
    expect(storage.remove).toHaveBeenCalledWith('plant', existing.url);
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
      publicBaseUrl: baseUrl,
    });
    expect(Object.keys(record).sort()).toEqual(['date', 'entityType', 'id', 'url']);
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
    const { policy, assertCanModify } = makeAllowAll();
    const a = makeImage({ id: 1, url: 'https://api.test/uploads/plant/a.webp' });
    const b = makeImage({ id: 2, url: 'https://api.test/uploads/plant/b.webp' });
    asMock(repo.deleteByEntity).mockResolvedValue([a, b]);

    await new DeleteEntityImagesUseCase(repo, storage, policy).execute('plant', 4, actor);

    expect(assertCanModify).toHaveBeenCalledWith('plant', 4, actor);
    expect(repo.deleteByEntity).toHaveBeenCalledWith('plant', 4);
    expect(storage.remove).toHaveBeenCalledTimes(2);
    expect(storage.remove).toHaveBeenCalledWith('plant', a.url);
    expect(storage.remove).toHaveBeenCalledWith('plant', b.url);
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

// ── translateMulterError ──────────────────────────────────────────────────────

describe('translateMulterError', () => {
  it('maps LIMIT_FILE_SIZE to a ValidationError naming the cap', () => {
    const out = translateMulterError(new multer.MulterError('LIMIT_FILE_SIZE'));
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toContain(`${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`);
  });

  it('maps other Multer errors to a generic upload ValidationError', () => {
    const out = translateMulterError(new multer.MulterError('LIMIT_UNEXPECTED_FILE'));
    expect(out).toBeInstanceOf(ValidationError);
    expect((out as ValidationError).message).toContain('Upload failed');
  });

  it('passes non-Multer errors through unchanged', () => {
    const err = new Error('boom');
    expect(translateMulterError(err)).toBe(err);
  });
});
