/**
 * modules/components/application/ComponentUseCases.ts
 *
 * Use cases for the (admin-managed) substrate component catalogue.
 * Validation and the create/update read-back orchestration moved here
 * from the router factory, matching the reference pattern (plants).
 */

import { z } from 'zod';
import type {
  ComponentRepository,
  ComponentDetail,
  ComponentListItem,
  ComponentPageQuery,
  FinenessLevel,
} from '../domain/Component';
import type { Page } from '../../../core/pagination';
import { NotFoundError, InternalError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import type { EntityImageCleanup } from '../../images/domain/Image';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

export const CreateComponentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  fineness: z.coerce.number().int().positive('Fineness must be a valid integer'),
});

export const UpdateComponentSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    fineness: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => d.name !== undefined || d.fineness !== undefined, {
    message: 'At least one of name or fineness must be provided for update',
  });

// ── Use Cases ─────────────────────────────────────────────────────────────────

export interface ComponentListResult {
  page: Page<ComponentListItem>;
  /** Present on the first page only. */
  total?: number;
}

export class ListComponentsUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(query: ComponentPageQuery, sort: string): Promise<ComponentListResult> {
    const page = await this.repo.findPage(query, sort);
    if (query.cursor) return { page };
    return { page, total: await this.repo.count(query.q) };
  }
}

export const FINENESS_LEVELS_TTL_MS = 3_600_000;

/** The levels are seeded lookup data, so they are kept in memory for an hour. */
export class GetFinenessLevelsUseCase {
  private cached: { levels: FinenessLevel[]; expiresAt: number } | null = null;

  constructor(
    private readonly repo: ComponentRepository,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(): Promise<FinenessLevel[]> {
    const now = this.now();
    if (this.cached && this.cached.expiresAt > now) return this.cached.levels;
    const levels = await this.repo.findFinenessLevels();
    this.cached = { levels, expiresAt: now + FINENESS_LEVELS_TTL_MS };
    return levels;
  }
}

export class GetComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(id: number): Promise<ComponentDetail> {
    const component = await this.repo.findById(id);
    if (!component) throw new NotFoundError('Component');
    return component;
  }
}

export class CreateComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(input: unknown): Promise<ComponentDetail> {
    const data = parseOrThrow(CreateComponentSchema, input, 'Invalid component data');

    const id = await this.repo.create(data.name, data.fineness);

    const component = await this.repo.findById(id);
    if (!component) throw new InternalError('Created component could not be read back');
    return component;
  }
}

export class UpdateComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(id: number, input: unknown): Promise<ComponentDetail> {
    const data = parseOrThrow(UpdateComponentSchema, input, 'Invalid component data');

    const updated = await this.repo.update(id, data);
    if (!updated) throw new NotFoundError('Component');

    const component = await this.repo.findById(id);
    if (!component) throw new NotFoundError('Component');
    return component;
  }
}

export class DeleteComponentUseCase {
  constructor(
    private readonly repo: ComponentRepository,
    private readonly images: EntityImageCleanup,
  ) {}

  async execute(id: number): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundError('Component');
    await this.images.removeAll('component', id);
  }
}
