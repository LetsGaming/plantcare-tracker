/**
 * modules/plants/application/PlantUseCases.ts
 *
 * All plant use cases in one file (small enough to not split).
 * Each use case takes a PlantRepository via constructor injection
 * and throws typed domain errors — never raw strings.
 *
 * Create and update return the full, freshly-read Plant so that the
 * controller has nothing to orchestrate: the create-then-refetch
 * sequence that used to live in the controller belongs to the use
 * case, which is the layer that knows a write must be answered with
 * the complete resource.
 */

import { z } from 'zod';
import type { PlantRepository } from '../domain/Plant';
import type { Plant } from '../domain/Plant';
import { NotFoundError, InternalError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

export const CreatePlantSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  species: z.string().min(1, 'Species is required').max(100),
  substrateId: z.number().int().positive('substrateId must be a positive integer'),
  isPublic: z.boolean().default(false),
});

export const UpdatePlantSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    species: z.string().min(1).max(100).optional(),
    substrateId: z.number().int().positive().optional(),
    isPublic: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.species !== undefined ||
      data.substrateId !== undefined ||
      data.isPublic !== undefined,
    { message: 'At least one field must be provided for update' },
  );

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class GetAllPlantsUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(userId: number | null): Promise<Plant[]> {
    const [publicPlants, privatePlants] = await Promise.all([
      this.repo.findAllPublic(),
      userId ? this.repo.findAllByUser(userId) : Promise.resolve([]),
    ]);

    // Merge and deduplicate (public plants owned by the user would appear twice)
    const seen = new Set<number>();
    return [...publicPlants, ...privatePlants].filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }
}

export class GetPlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number): Promise<Plant> {
    const plant = await this.repo.findById(id);
    if (!plant) throw new NotFoundError('Plant');
    return plant;
  }
}

export class CreatePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(input: unknown, userId: number): Promise<Plant> {
    const data = parseOrThrow(CreatePlantSchema, input, 'Invalid plant data');

    const plantId = await this.repo.create({ ...data, userId });

    // Read back the full resource so the client receives the same shape
    // a GET would produce (joined substrate name, images, timestamps).
    const plant = await this.repo.findById(plantId);
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

  async execute(id: number, userId: number, input: unknown): Promise<Plant> {
    const data = parseOrThrow(UpdatePlantSchema, input, 'Invalid update data');

    const updated = await this.repo.update(id, userId, data);
    if (!updated) throw new NotFoundError('Plant');

    const plant = await this.repo.findById(id);
    if (!plant) throw new NotFoundError('Plant');
    return plant;
  }
}

export class DeletePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number, userId: number): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Plant');
  }
}
