/**
 * modules/substrate/presentation/substrateRoutes.ts
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created resource + Location header
 *  - PATCH  → 200 + updated resource
 *  - DELETE → 204 No Content
 *
 * URL cleanup:
 *  - GET /substrates/:id          (was /substrates/substrate/:id)
 *  - POST /substrates/:id/components   (was /substrates/components/:id)
 *  - PATCH /substrates/:id/components  (was /substrates/components/:id)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SQLiteSubstrateRepository } from '../infrastructure/SQLiteSubstrateRepository';
import { NotFoundError, ValidationError, ForbiddenError } from '../../../core/errors';
import { authenticateToken } from '../../../core/middleware';
import { filterDuplicatesById, ensureArray } from '../../../core/utils';

const CreateSubstrateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  isPublic: z.boolean().default(false),
});

const UpdateSubstrateSchema = z.object({
  name: z.string().min(1).optional(),
  isPublic: z.boolean().optional(),
  removedComponents: z.array(z.number().int()).optional(),
});

const ComponentsSchema = z.array(z.object({
  componentId: z.number().int().positive(),
  parts: z.coerce.number().positive(),
})).min(1, 'Components array is required');

export const createSubstrateRouter = (_pool?: unknown): Router => {
  const router = Router();
  const repo = new SQLiteSubstrateRepository();

  // GET / — all public + own, deduped
  router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id ?? null;
      const [pub, priv] = await Promise.all([
        repo.findAllPublic(),
        userId ? repo.findAllByUser(userId) : Promise.resolve([]),
      ]);
      res.json({ data: filterDuplicatesById([...pub, ...priv], 'substrate_id') });
    } catch (err) { next(err); }
  });

  // GET /:id
  router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
      const s = await repo.findById(Number(req.params.id));
      if (!s) return next(new NotFoundError('Substrate'));
      res.json({ data: s });
    } catch (err) { next(err); }
  });

  // POST / — create, return full substrate + Location
  router.post('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateSubstrateSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const id = await repo.create(parsed.data.name, req.user!.id, parsed.data.isPublic);
      const substrate = await repo.findById(id);
      res
        .status(201)
        .location(`/substrates/${id}`)
        .json({ data: substrate });
    } catch (err) { next(err); }
  });

  // PATCH /:id — update metadata + optional component removal, return updated substrate
  router.patch('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateSubstrateSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const { name, isPublic, removedComponents } = parsed.data;
      if (name === undefined && isPublic === undefined && !removedComponents?.length) {
        return next(new ValidationError('At least one field must be provided for update'));
      }

      const id = Number(req.params.id);
      const existing = await repo.findById(id);
      if (!existing) return next(new NotFoundError('Substrate'));
      if (existing.substrate_user_id !== req.user!.id) return next(new ForbiddenError('Unauthorized to update this substrate'));

      if (name !== undefined || isPublic !== undefined) {
        await repo.update(id, req.user!.id, { name, isPublic });
      }
      if (removedComponents?.length) {
        await repo.deleteComponents(id, removedComponents);
      }

      const updated = await repo.findById(id);
      res.json({ data: updated });
    } catch (err) { next(err); }
  });

  // POST /:id/components — add components, return updated substrate
  router.post('/:id/components', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const existing = await repo.findById(id);
      if (!existing) return next(new NotFoundError('Substrate'));
      if (existing.substrate_user_id !== req.user!.id) return next(new ForbiddenError('Unauthorized to update this substrate'));

      const components = ensureArray(req.body.components);
      const parsed = ComponentsSchema.safeParse(components);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      await repo.addComponents(id, parsed.data);
      const updated = await repo.findById(id);
      res
        .status(201)
        .location(`/substrates/${id}`)
        .json({ data: updated });
    } catch (err) { next(err); }
  });

  // PATCH /:id/components — upsert components, return updated substrate
  router.patch('/:id/components', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const existing = await repo.findById(id);
      if (!existing) return next(new NotFoundError('Substrate'));
      if (existing.substrate_user_id !== req.user!.id) return next(new ForbiddenError('Unauthorized to edit this substrate'));

      const components = ensureArray(req.body.components);
      const parsed = ComponentsSchema.safeParse(components);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      await repo.upsertComponents(id, parsed.data);
      const updated = await repo.findById(id);
      res.json({ data: updated });
    } catch (err) { next(err); }
  });

  // DELETE /:id — 204 No Content
  router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id), req.user!.id);
      if (!deleted) return next(new NotFoundError('Substrate'));
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
};