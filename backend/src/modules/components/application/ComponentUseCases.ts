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
  ComponentData,
  FinenessLevel,
} from '../domain/Component';
import { NotFoundError, InternalError } from '../../../core/errors';
import { parseOrThrow } from '../../../core/validation';

// ── Input schemas (Zod) ───────────────────────────────────────────────────────

export const CreateComponentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fineness: z.coerce.number().int().positive('Fineness must be a valid integer'),
});

export const UpdateComponentSchema = z
  .object({
    name: z.string().min(1).optional(),
    fineness: z.coerce.number().int().positive().optional(),
  })
  .refine((d) => d.name !== undefined || d.fineness !== undefined, {
    message: 'At least one of name or fineness must be provided for update',
  });

// ── Use Cases ─────────────────────────────────────────────────────────────────

export class GetAllComponentsUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(): Promise<ComponentData[]> {
    return this.repo.findAll();
  }
}

export class GetFinenessLevelsUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(): Promise<FinenessLevel[]> {
    return this.repo.findFinenessLevels();
  }
}

export class GetComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(id: number): Promise<ComponentData> {
    const component = await this.repo.findById(id);
    if (!component) throw new NotFoundError('Component');
    return component;
  }
}

export class CreateComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(input: unknown): Promise<ComponentData> {
    const data = parseOrThrow(CreateComponentSchema, input, 'Invalid component data');

    const id = await this.repo.create(data.name, data.fineness);

    const component = await this.repo.findById(id);
    if (!component) throw new InternalError('Created component could not be read back');
    return component;
  }
}

export class UpdateComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(id: number, input: unknown): Promise<ComponentData> {
    const data = parseOrThrow(UpdateComponentSchema, input, 'Invalid component data');

    const updated = await this.repo.update(id, data);
    if (!updated) throw new NotFoundError('Component');

    const component = await this.repo.findById(id);
    if (!component) throw new NotFoundError('Component');
    return component;
  }
}

export class DeleteComponentUseCase {
  constructor(private readonly repo: ComponentRepository) {}

  async execute(id: number): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) throw new NotFoundError('Component');
  }
}
