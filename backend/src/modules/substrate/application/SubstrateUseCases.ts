/**
 * modules/substrate/application/SubstrateUseCases.ts
 *
 * Use cases for substrates and their component composition.
 *
 * Previously the router factory held the zod schemas, the public+own
 * merge-and-dedupe rule, the ownership checks, and the update/refetch
 * orchestration. All of that is business logic and now lives here,
 * matching the reference pattern (plants).
 */

import { z } from 'zod';
import type { SubstrateRepository, SubstrateData } from '../domain/Substrate';
import {
  NotFoundError,
  ForbiddenError,
  InternalError,
} from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import { ensureArray, filterDuplicatesById } from '../../../core/utils';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

export const CreateSubstrateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  isPublic: z.boolean().default(false),
});

export const UpdateSubstrateSchema = z
  .object({
    name: z.string().min(1).optional(),
    isPublic: z.boolean().optional(),
    removedComponents: z.array(z.number().int()).optional(),
  })
  .refine(
    (d) =>
      d.name !== undefined ||
      d.isPublic !== undefined ||
      (d.removedComponents !== undefined && d.removedComponents.length > 0),
    { message: 'At least one field must be provided for update' },
  );

export const ComponentsSchema = z
  .array(
    z.object({
      componentId: z.number().int().positive(),
      parts: z.coerce.number().positive(),
    }),
  )
  .min(1, 'Components array is required');

export type SubstrateComponentInput = z.infer<typeof ComponentsSchema>[number];

// ── Shared guards ─────────────────────────────────────────────────────────────

/**
 * Loads the substrate and asserts the caller owns it.
 * 404 when it does not exist, 403 when it belongs to someone else.
 */
async function loadOwnedSubstrate(
  repo: SubstrateRepository,
  substrateId: number,
  userId: number,
  action: string,
): Promise<SubstrateData> {
  const existing = await repo.findById(substrateId);
  if (!existing) throw new NotFoundError('Substrate');
  if (existing.substrate_user_id !== userId) {
    throw new ForbiddenError(`Unauthorized to ${action} this substrate`);
  }
  return existing;
}

/** Extracts and validates the components payload from a request body. */
function parseComponents(input: unknown): SubstrateComponentInput[] {
  const body = (input ?? {}) as Record<string, unknown>;
  // Clients may send a single object instead of an array — normalise first.
  const components = ensureArray(body.components);
  return parseOrThrow(ComponentsSchema, components, 'Invalid components data');
}

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class GetAllSubstratesUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(userId: number | null): Promise<SubstrateData[]> {
    const [publicSubstrates, ownSubstrates] = await Promise.all([
      this.repo.findAllPublic(),
      userId ? this.repo.findAllByUser(userId) : Promise.resolve([]),
    ]);

    // Public substrates owned by the caller would appear twice — dedupe.
    return filterDuplicatesById(
      [...publicSubstrates, ...ownSubstrates],
      'substrate_id',
    );
  }
}

export class GetSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(id: number): Promise<SubstrateData> {
    const substrate = await this.repo.findById(id);
    if (!substrate) throw new NotFoundError('Substrate');
    return substrate;
  }
}

export class CreateSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(input: unknown, userId: number): Promise<SubstrateData> {
    const data = parseOrThrow(CreateSubstrateSchema, input, 'Invalid substrate data');

    const id = await this.repo.create(data.name, userId, data.isPublic);

    const substrate = await this.repo.findById(id);
    if (!substrate) throw new InternalError('Created substrate could not be read back');
    return substrate;
  }
}

export class UpdateSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(
    id: number,
    userId: number,
    input: unknown,
  ): Promise<SubstrateData> {
    const data = parseOrThrow(UpdateSubstrateSchema, input, 'Invalid substrate data');

    await loadOwnedSubstrate(this.repo, id, userId, 'update');

    if (data.name !== undefined || data.isPublic !== undefined) {
      await this.repo.update(id, userId, {
        name: data.name,
        isPublic: data.isPublic,
      });
    }
    if (data.removedComponents?.length) {
      await this.repo.deleteComponents(id, data.removedComponents);
    }

    const updated = await this.repo.findById(id);
    if (!updated) throw new NotFoundError('Substrate');
    return updated;
  }
}

export class AddSubstrateComponentsUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(
    substrateId: number,
    userId: number,
    input: unknown,
  ): Promise<SubstrateData> {
    await loadOwnedSubstrate(this.repo, substrateId, userId, 'update');

    const components = parseComponents(input);
    await this.repo.addComponents(substrateId, components);

    const updated = await this.repo.findById(substrateId);
    if (!updated) throw new NotFoundError('Substrate');
    return updated;
  }
}

export class UpsertSubstrateComponentsUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(
    substrateId: number,
    userId: number,
    input: unknown,
  ): Promise<SubstrateData> {
    await loadOwnedSubstrate(this.repo, substrateId, userId, 'edit');

    const components = parseComponents(input);
    await this.repo.upsertComponents(substrateId, components);

    const updated = await this.repo.findById(substrateId);
    if (!updated) throw new NotFoundError('Substrate');
    return updated;
  }
}

export class DeleteSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(id: number, userId: number): Promise<void> {
    // The repository scopes the DELETE by user_id, so "not found" and
    // "not yours" both come back as false — answered uniformly as 404
    // to avoid leaking whether a foreign substrate id exists.
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Substrate');
  }
}
