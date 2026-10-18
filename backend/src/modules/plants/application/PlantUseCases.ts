/**
 * modules/plants/application/PlantUseCases.ts
 *
 * All plant use cases in one file (small enough to not split).
 * Each use case takes a PlantRepository via constructor injection
 * and throws typed domain errors — never raw strings.
 *
 * Create and update return the full, freshly-read Plant (the detail
 * resource) so that the controller has nothing to orchestrate.
 */

import { z } from 'zod';
import type {
  Plant,
  PlantListPage,
  PlantListQuery,
  PlantRepository,
  PlantScope,
} from '../domain/Plant';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { NotFoundError, InternalError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

/** Read by the controller (see tzOf); declared so the schema does not silently drop it. */
const TzOffsetField = z.union([z.string(), z.number()]).optional();

export const CreatePlantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  species: z.string().max(100).nullable().optional(),
  substrateId: z
    .number()
    .int()
    .positive('substrateId must be a positive integer')
    .nullable()
    .optional(),
  isPublic: z.boolean().default(false),
  tz_offset: TzOffsetField,
});

/** An empty or null species and a null substrateId clear the field. */
export const UpdatePlantSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    species: z.string().max(100).nullable().optional(),
    substrateId: z.number().int().positive().nullable().optional(),
    isPublic: z.boolean().optional(),
    tz_offset: TzOffsetField,
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.species !== undefined ||
      data.substrateId !== undefined ||
      data.isPublic !== undefined,
    { message: 'At least one field must be provided for update' },
  );

/**
 * A missing substrate and another user's private one answer the same 404,
 * so a caller cannot probe which ids exist.
 */
const assertSubstrateUsable = async (
  repo: PlantRepository,
  substrateId: number | null | undefined,
  userId: number,
): Promise<void> => {
  if (substrateId === null || substrateId === undefined) return;
  if (!(await repo.isSubstrateUsableBy(substrateId, userId))) {
    throw new NotFoundError('Substrate');
  }
};

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class ListPlantsUseCase {
  constructor(private readonly repo: PlantRepository) {}

  /** `viewerId` is null for anyone without plants of their own (anonymous and guest sessions). */
  async execute(
    scope: PlantScope,
    query: PlantListQuery,
    viewerId: number | null,
    tz: number,
  ): Promise<PlantListPage> {
    if (scope === 'public') return this.repo.listPublic(query);
    if (viewerId === null) {
      return { items: [], nextCursor: null, ...(query.cursor === null ? { total: 0 } : {}) };
    }
    return this.repo.listMine(viewerId, query, tz);
  }
}

export class GetPlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number, userId: number | null, tz: number): Promise<Plant> {
    const plant = await this.repo.findById(id, userId, tz);
    // A private plant answers exactly like a missing one, so ids cannot be probed.
    if (!plant || !plant.isVisibleTo(userId)) throw new NotFoundError('Plant');
    return plant;
  }
}

export class CreatePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(input: unknown, userId: number, tz: number): Promise<Plant> {
    const data = parseOrThrow(CreatePlantSchema, input, 'Invalid plant data');
    await assertSubstrateUsable(this.repo, data.substrateId, userId);

    const plantId = await this.repo.create({ ...data, userId });

    // Read back the full resource so the client receives the same shape
    // a GET would produce (joined substrate name, images, timestamps).
    const plant = await this.repo.findById(plantId, userId, tz);
    if (!plant) {
      // The row we just inserted has vanished — a data-layer fault, not
      // a client error, hence 500 rather than 404.
      throw new InternalError('Created plant could not be read back');
    }
    return plant;
  }
}

export class UpdatePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number, userId: number, input: unknown, tz: number): Promise<Plant> {
    const data = parseOrThrow(UpdatePlantSchema, input, 'Invalid update data');

    const current = await this.repo.findOwnership(id);
    if (!current || current.userId !== userId) throw new NotFoundError('Plant');
    // A plant may keep a substrate whose owner made it private since; only a move is checked.
    if (data.substrateId !== current.substrateId) {
      await assertSubstrateUsable(this.repo, data.substrateId, userId);
    }

    const updated = await this.repo.update(id, userId, data);
    if (!updated) throw new NotFoundError('Plant');

    const plant = await this.repo.findById(id, userId, tz);
    if (!plant) throw new NotFoundError('Plant');
    return plant;
  }
}

export class DeletePlantUseCase {
  constructor(
    private readonly repo: PlantRepository,
    private readonly images: EntityImageCleanup,
    private readonly onDeleted?: (ownerUserId: number) => void,
  ) {}

  async execute(id: number, userId: number): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Plant');
    await this.images.removeAll('plant', id);
    this.onDeleted?.(userId);
  }
}
