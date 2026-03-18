/**
 * modules/plants/application/PlantUseCases.ts
 *
 * All plant use cases in one file (small enough to not split).
 * Each use case takes a PlantRepository via constructor injection
 * and throws typed domain errors — never raw strings.
 *
 * V1 improvement: validation was a tiny validatePlantData() helper
 * in the controller that threw plain Error('some string'). The controller
 * then compared err.message === 'Name, species...' to pick status codes.
 */

import { z } from 'zod';
import type { PlantRepository } from '../domain/Plant';
import type { Plant } from '../domain/Plant';
import { ValidationError, NotFoundError } from '../../../core/errors';

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

  async execute(input: unknown, userId: number): Promise<number> {
    const result = CreatePlantSchema.safeParse(input);
    if (!result.success) {
      const fields = Object.fromEntries(
        result.error.issues.map((e) => [e.path.join('.'), e.message]),
      );
      throw new ValidationError('Invalid plant data', fields);
    }

    return this.repo.create({ ...result.data, userId });
  }
}

export class UpdatePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number, userId: number, input: unknown): Promise<void> {
    const result = UpdatePlantSchema.safeParse(input);
    if (!result.success) {
      const fields = Object.fromEntries(
        result.error.issues.map((e) => [e.path.join('.'), e.message]),
      );
      throw new ValidationError('Invalid update data', fields);
    }

    const updated = await this.repo.update(id, userId, result.data);
    if (!updated) throw new NotFoundError('Plant');
  }
}

export class DeletePlantUseCase {
  constructor(private readonly repo: PlantRepository) {}

  async execute(id: number, userId: number): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Plant');
  }
}
