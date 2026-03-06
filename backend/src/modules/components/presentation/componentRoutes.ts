/**
 * modules/components/presentation/componentRoutes.ts
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { MySQLComponentRepository } from '../infrastructure/MySQLComponentRepository';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { authenticateToken, isAdmin } from '../../../core/middleware';

const CreateComponentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  fineness: z.number().int().positive('Fineness must be a valid integer'),
});

const UpdateComponentSchema = z.object({
  name: z.string().min(1).optional(),
  fineness: z.number().int().positive().optional(),
}).refine(
  (d) => d.name !== undefined || d.fineness !== undefined,
  { message: 'At least one of name or fineness must be provided for update' },
);

export const createComponentRouter = (pool: Pool): Router => {
  const router = Router();
  const repo = new MySQLComponentRepository(pool);

  // GET / — all components
  router.get('/', authenticateToken, async (_req, res, next) => {
    try {
      res.json({ success: true, data: await repo.findAll() });
    } catch (err) { next(err); }
  });

  // GET /fineness-levels
  router.get('/fineness-levels', authenticateToken, async (_req, res, next) => {
    try {
      res.json({ success: true, data: await repo.findFinenessLevels() });
    } catch (err) { next(err); }
  });

  // GET /component/:id
  router.get('/component/:id', authenticateToken, async (req, res, next) => {
    try {
      const c = await repo.findById(Number(req.params.id));
      if (!c) return next(new NotFoundError('Component'));
      res.json({ success: true, data: c });
    } catch (err) { next(err); }
  });

  // POST /admin — admin only
  router.post('/admin', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateComponentSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.errors[0].message));
      }
      const id = await repo.create(parsed.data.name, parsed.data.fineness);
      res.status(201).json({ success: true, data: { id } });
    } catch (err) { next(err); }
  });

  // PUT /admin/:id — admin only
  router.put('/admin/:id', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateComponentSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.errors[0].message));
      const updated = await repo.update(Number(req.params.id), parsed.data);
      if (!updated) return next(new NotFoundError('Component'));
      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  });

  // DELETE /admin/:id — admin only
  router.delete('/admin/:id', authenticateToken, isAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id));
      if (!deleted) return next(new NotFoundError('Component'));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  });

  return router;
};
