/**
 * modules/watering/presentation/wateringRoutes.ts
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SQLiteWateringRepository } from '../infrastructure/SQLiteWateringRepository';
import { NotFoundError, ValidationError } from '../../../core/errors';
import { authenticateToken } from '../../../core/middleware';
import { formatToDBDate } from '../../../core/utils';

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

export const createWateringRouter = (_pool?: unknown): Router => {
  const router = Router();
  const repo = new SQLiteWateringRepository();

  router.get('/fertilizer-types', authenticateToken, async (_req, res, next) => {
    try {
      const types = await repo.findFertilizerTypes();
      if (!types.length) return next(new NotFoundError('Fertilizer types'));
      res.json({ success: true, data: types });
    } catch (err) { next(err); }
  });

  router.get('/plant/:plantId', authenticateToken, async (req, res, next) => {
    try {
      const records = await repo.findByPlant(Number(req.params.plantId), req.user!.id);
      res.json({ success: true, data: records });
    } catch (err) { next(err); }
  });

  router.get('/:id', authenticateToken, async (req, res, next) => {
    try {
      const record = await repo.findById(Number(req.params.id), req.user!.id);
      if (!record) return next(new NotFoundError('Watering record'));
      res.json({ success: true, data: record });
    } catch (err) { next(err); }
  });

  router.post('/:plantId', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = CreateWateringSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError('Invalid watering data'));

      const { date = Date.now(), usedFertilizer, fertilizerTypeId } = parsed.data;
      const recordId = await repo.create({
        plantId: Number(req.params.plantId),
        date: formatToDBDate(date),
        usedFertilizer,
        fertilizerTypeId: fertilizerTypeId ?? null,
      }, req.user!.id);
      if (!recordId) return next(new NotFoundError('Plant'));
      res.status(201).json({ success: true, data: { waterRecordId: recordId } });
    } catch (err) { next(err); }
  });

  router.patch('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = UpdateWateringSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(new ValidationError(parsed.error.issues[0].message));
      }
      const { date, usedFertilizer, fertilizerTypeId } = parsed.data;
      const updated = await repo.update(Number(req.params.id), req.user!.id, {
        date: date ? formatToDBDate(date) : undefined,
        usedFertilizer,
        fertilizerTypeId,
      });
      if (!updated) return next(new NotFoundError('Watering record'));
      res.json({ success: true, data: { updated: true } });
    } catch (err) { next(err); }
  });

  router.delete('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted = await repo.delete(Number(req.params.id), req.user!.id);
      if (!deleted) return next(new NotFoundError('Watering record'));
      res.json({ success: true, data: { deleted: true } });
    } catch (err) { next(err); }
  });

  return router;
};
