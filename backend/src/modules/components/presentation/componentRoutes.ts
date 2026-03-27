/**
 * modules/components/presentation/componentRoutes.ts
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created resource + Location header
 *  - PUT    → 200 + updated resource  (full replace — only name+fineness exist)
 *  - DELETE → 204 No Content
 *
 * URL cleanup:
 *  - GET /components/:id  (was /components/component/:id)
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SQLiteComponentRepository } from '../infrastructure/SQLiteComponentRepository';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { authenticateToken, isAdmin } from '../../../core/middleware';

const CreateComponentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fineness: z.coerce.number().int().positive('Fineness must be a valid integer'),
});

const UpdateComponentSchema = z.object({
  name: z.string().min(1).optional(),
  fineness: z.coerce.number().int().positive().optional(),
}).refine(
  (d) => d.name !== undefined || d.fineness !== undefined,
  { message: 'At least one of name or fineness must be provided for update' },
);

export const createComponentRouter = (_pool?: unknown): Router => {
  const router = Router();
  const repo = new SQLiteComponentRepository();

  // GET / — all components
  router.get('/', authenticateToken, async (_req, res, next) => {
    try {
      res.json({ data: await repo.findAll() });
    } catch (err) { next(err); }
  });

  // GET /fineness-levels
  router.get('/fineness-levels', authenticateToken, async (_req, res, next) => {
    try {
      res.json({ data: await repo.findFinenessLevels() });
    } catch (err) { next(err); }
  });

  // GET /:id  (was /component/:id)
  router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
      const c = await repo.findById(Number(req.params.id));
      if (!c) return next(new NotFoundError('Component'));
      res.json({ data: c });
    } catch (err) { next(err); }
  });

  // POST / — admin only, return created component + Location
  router.post('/', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateComponentSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const id = await repo.create(parsed.data.name, parsed.data.fineness);
      const component = await repo.findById(id);
      res
        .status(201)
        .location(`/components/${id}`)
        .json({ data: component });
    } catch (err) { next(err); }
  });

  // PUT /:id — admin only, return updated component
  router.put('/:id', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateComponentSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const id = Number(req.params.id);
      const updated = await repo.update(id, parsed.data);
      if (!updated) return next(new NotFoundError('Component'));

      const component = await repo.findById(id);
      res.json({ data: component });
    } catch (err) { next(err); }
  });

  // DELETE /:id — admin only, 204 No Content
  router.delete('/:id', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id));
      if (!deleted) return next(new NotFoundError('Component'));
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
};