/**
 * modules/substrate/application/SubstrateUseCases.ts
 *
 * Use cases for substrates and their component composition.
 */

import { z } from 'zod';
import { isSubstrateVisibleTo } from '../domain/Substrate';
import type {
  SubstrateData,
  SubstrateListParams,
  SubstratePage,
  SubstrateRepository,
  SubstrateSort,
} from '../domain/Substrate';
import { NotFoundError, InternalError, ValidationError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';
import { NAME_MAX_LENGTH } from '../../../core/config/constants';
import { parseListQuery } from '../../../core/pagination';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { ensureArray } from '../../../core/utils';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

const ComponentItemSchema = z.object({
  componentId: z.number().int().positive(),
  parts: z.coerce.number().positive(),
});

const MAX_COMPONENTS = 100;

export const ReplaceComponentsSchema = z
  .array(ComponentItemSchema)
  .max(MAX_COMPONENTS)
  .refine((list) => new Set(list.map((c) => c.componentId)).size === list.length, {
    message: 'Duplicate components are not allowed',
  });

export const CreateSubstrateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(NAME_MAX_LENGTH),
  isPublic: z.boolean().default(false),
  components: ReplaceComponentsSchema.optional(),
});

export const UpdateSubstrateSchema = z
  .object({
    name: z.string().min(1).max(NAME_MAX_LENGTH).optional(),
    isPublic: z.boolean().optional(),
    components: ReplaceComponentsSchema.optional(),
  })
  .refine((d) => d.name !== undefined || d.isPublic !== undefined || d.components !== undefined, {
    message: 'At least one field must be provided for update',
  });

const LIST_SORTS = {
  created: { valueType: 'number', idType: 'number', direction: 'desc' },
  name: { valueType: 'string', idType: 'number', direction: 'asc' },
} as const;

// ── Input normalisation ───────────────────────────────────────────────────────

/** Clients may send a single object or an index-keyed object instead of an array. */
function withComponentsArray(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input;
  const body = input as Record<string, unknown>;
  if (body.components === undefined || body.components === null) return input;
  return { ...body, components: ensureArray(body.components) };
}

function parseComponentFilter(raw: unknown): number | null {
  if (raw === undefined || raw === '') return null;
  const value = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < 1) {
    throw new ValidationError('component_id must be a positive integer.', {
      component_id: 'invalid',
    });
  }
  return value;
}

// ── Use Cases ─────────────────────────────────────────────────────────────────

export interface SubstrateViewer {
  id: number;
  isGuest: boolean;
}

export class ListSubstratesUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(query: unknown, viewer: SubstrateViewer): Promise<SubstratePage> {
    const parsed = parseListQuery<SubstrateSort, 'mine' | 'public'>(query, {
      sorts: LIST_SORTS,
      defaultSort: 'created',
      scopes: ['mine', 'public'],
      defaultScope: viewer.isGuest ? 'public' : 'mine',
    });
    const params: SubstrateListParams = {
      limit: parsed.limit,
      cursor: parsed.cursor,
      sort: parsed.sort,
      q: parsed.q,
      componentId: parseComponentFilter(
        (query as Record<string, unknown> | undefined)?.component_id,
      ),
    };

    if (parsed.scope === 'public') return this.repo.listPublic(params);
    if (viewer.isGuest) {
      return { items: [], nextCursor: null, ...(params.cursor ? {} : { total: 0 }) };
    }
    return this.repo.listMine(viewer.id, params);
  }
}

export class GetSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(id: number, userId: number | null): Promise<SubstrateData> {
    const substrate = await this.repo.findById(id);
    if (!substrate || !isSubstrateVisibleTo(substrate, userId)) {
      throw new NotFoundError('Substrate');
    }
    return substrate;
  }
}

export class CreateSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(input: unknown, userId: number): Promise<SubstrateData> {
    const data = parseOrThrow(
      CreateSubstrateSchema,
      withComponentsArray(input),
      'Invalid substrate data',
    );

    const id = await this.repo.create(data.name, userId, data.isPublic, data.components);

    const substrate = await this.repo.findById(id);
    if (!substrate) throw new InternalError('Created substrate could not be read back');
    return substrate;
  }
}

export class UpdateSubstrateUseCase {
  constructor(private readonly repo: SubstrateRepository) {}

  async execute(id: number, userId: number, input: unknown): Promise<SubstrateData> {
    const data = parseOrThrow(
      UpdateSubstrateSchema,
      withComponentsArray(input),
      'Invalid substrate data',
    );

    const updated = await this.repo.update(id, userId, data);
    if (!updated) throw new NotFoundError('Substrate');

    const substrate = await this.repo.findById(id);
    if (!substrate) throw new NotFoundError('Substrate');
    return substrate;
  }
}

export class DeleteSubstrateUseCase {
  constructor(
    private readonly repo: SubstrateRepository,
    private readonly images: EntityImageCleanup,
  ) {}

  async execute(id: number, userId: number): Promise<void> {
    // The repository scopes the DELETE by user_id, so "not found" and
    // "not yours" both come back as false and are answered uniformly as 404.
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) throw new NotFoundError('Substrate');
    await this.images.removeAll('substrate', id);
  }
}
