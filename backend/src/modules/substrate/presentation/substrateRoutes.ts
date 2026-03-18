/**
 * modules/substrate/presentation/substrateRoutes.ts
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import { MySQLSubstrateRepository } from '../infrastructure/MySQLSubstrateRepository';
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
  parts: z.number().positive(),
})).min(1, 'Components array is required');

export const createSubstrateRouter = (pool: Pool): Router => {
  const router = Router();
  const repo = new MySQLSubstrateRepository(pool);

  // GET / — all public + private for the logged-in user, deduped
  router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id ?? null;
      const [pub, priv] = await Promise.all([
        repo.findAllPublic(),
        userId ? repo.findAllByUser(userId) : Promise.resolve([]),
      ]);
      const all = filterDuplicatesById([...pub, ...priv], 'substrate_id');
      res.json({ success: true, data: all });
    } catch (err) { next(err); }
  });

  // GET /public
  router.get('/public', authenticateToken, async (_req, res, next) => {
    try {
      res.json({ success: true, data: await repo.findAllPublic() });
    } catch (err) { next(err); }
  });

  // GET /private
  router.get('/private', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: await repo.findAllByUser(req.user!.id) });
    } catch (err) { next(err); }
  });

  // GET /substrate/:id  (V1 used this path prefix — kept for compatibility)
  router.get('/substrate/:id', authenticateToken, async (req, res, next) => {
    try {
      const s = await repo.findById(Number(req.params.id));
      if (!s) return next(new NotFoundError('Substrate'));
      res.json({ success: true, data: s });
    } catch (err) { next(err); }
  });

  // POST /
  router.post('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateSubstrateSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.issues[0].message));
      }
      const id = await repo.create(parsed.data.name, req.user!.id, parsed.data.isPublic);
      res.status(201).json({ success: true, data: { substrateId: id } });
    } catch (err) { next(err); }
  });

  // PATCH /:id — update name/isPublic + optionally remove components
  router.patch('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateSubstrateSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const { name, isPublic, removedComponents } = parsed.data;
      if (name === undefined && isPublic === undefined && !removedComponents?.length) {
        return next(new ValidationError('At least one field must be provided for update'));
      }

      const existing = await repo.findById(Number(req.params.id));
      if (!existing) return next(new NotFoundError('Substrate'));
      if (existing.substrate_user_id !== req.user!.id) return next(new ForbiddenError('Unauthorized to update this substrate'));

      if (name !== undefined || isPublic !== undefined) {
        await repo.update(Number(req.params.id), req.user!.id, { name, isPublic });
      }
      if (removedComponents?.length) {
        await repo.deleteComponents(Number(req.params.id), removedComponents);
      }
      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  });

  // POST /components/:id — add components
  router.post('/components/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const components = ensureArray(req.body.components);
      const parsed = ComponentsSchema.safeParse(components);
      if (!parsed.success) return next(new ValidationError('Components array is required'));
      await repo.addComponents(Number(req.params.id), parsed.data);
      res.status(201).json({ success: true, data: { added: true } });
    } catch (err) { next(err); }
  });

  // PATCH /components/:id — upsert components
  router.patch('/components/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const components = ensureArray(req.body.components);
      const parsed = ComponentsSchema.safeParse(components);
      if (!parsed.success) return next(new ValidationError('Components array is required'));

      const existing = await repo.findById(Number(req.params.id));
      if (!existing) return next(new NotFoundError('Substrate'));
      if (existing.substrate_user_id !== req.user!.id) return next(new ForbiddenError('Unauthorized to edit this substrate'));

      await repo.upsertComponents(Number(req.params.id), parsed.data);
      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  });

  // DELETE /:id
  router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id), req.user!.id);
      if (!deleted) return next(new NotFoundError('Substrate'));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  });

  return router;
};
