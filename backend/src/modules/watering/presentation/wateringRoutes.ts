/**
 * modules/watering/presentation/wateringRoutes.ts
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created record + Location header
 *  - PATCH  → 200 + updated record
 *  - DELETE → 204 No Content
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SQLiteWateringRepository } from '../infrastructure/SQLiteWateringRepository';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { authenticateToken } from '../../../core/middleware';

const CreateWateringSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  usedFertilizer: z.boolean().default(false),
  fertilizerTypeId: z.number().int().nullable().optional(),
});

const UpdateWateringSchema = z.object({
  date: z.union([z.string(), z.number()]).optional(),
  usedFertilizer: z.boolean().optional(),
  fertilizerTypeId: z.number().int().nullable().optional(),
}).refine(
  (d) => d.date !== undefined || d.usedFertilizer !== undefined || d.fertilizerTypeId !== undefined,
  { message: 'At least one field must be provided for update' },
);

/** Normalise a date value to Unix epoch seconds for SQLite storage */
const toEpochSeconds = (date: string | number): number =>
  typeof date === 'number'
    ? (date > 1e10 ? Math.floor(date / 1000) : Math.floor(date))
    : Math.floor(new Date(date).getTime() / 1000);

export const createWateringRouter = (_pool?: unknown): Router => {
  const router = Router();
  const repo = new SQLiteWateringRepository();

  // GET /fertilizer-types
  router.get('/fertilizer-types', authenticateToken, async (_req, res, next) => {
    try {
      const types = await repo.findFertilizerTypes();
      if (!types.length) return next(new NotFoundError('Fertilizer types'));
      res.json({ data: types });
    } catch (err) { next(err); }
  });

  // GET /plant/:plantId — all records for a plant
  router.get('/plant/:plantId', authenticateToken, async (req, res, next) => {
    try {
      const records = await repo.findByPlant(Number(req.params.plantId), req.user!.id);
      res.json({ data: records });
    } catch (err) { next(err); }
  });

  // GET /:id — single record
  router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
      const record = await repo.findById(Number(req.params.id), req.user!.id);
      if (!record) return next(new NotFoundError('Watering record'));
      res.json({ data: record });
    } catch (err) { next(err); }
  });

  // POST /:plantId — create record, return it
  router.post('/:plantId', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateWateringSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError('Invalid watering data'));

      const { date = Date.now(), usedFertilizer, fertilizerTypeId } = parsed.data;
      const epochSeconds = toEpochSeconds(date);
      const plantId = Number(req.params.plantId);

      const recordId = await repo.create({
        plantId,
        date: epochSeconds,
        usedFertilizer,
        fertilizerTypeId: fertilizerTypeId ?? null,
      }, req.user!.id);

      if (!recordId) return next(new NotFoundError('Plant'));

      const record = await repo.findById(recordId, req.user!.id);
      res
        .status(201)
        .location(`/watering/${recordId}`)
        .json({ data: record });
    } catch (err) { next(err); }
  });

  // PATCH /:id — partial update, return updated record
  router.patch('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateWateringSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError(parsed.error.issues[0].message));

      const { date, usedFertilizer, fertilizerTypeId } = parsed.data;
      const id = Number(req.params.id);

      const updated = await repo.update(id, req.user!.id, {
        date: date !== undefined ? toEpochSeconds(date) : undefined,
        usedFertilizer,
        fertilizerTypeId,
      });
      if (!updated) return next(new NotFoundError('Watering record'));

      const record = await repo.findById(id, req.user!.id);
      res.json({ data: record });
    } catch (err) { next(err); }
  });

  // DELETE /:id — 204 No Content
  router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id), req.user!.id);
      if (!deleted) return next(new NotFoundError('Watering record'));
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
};
