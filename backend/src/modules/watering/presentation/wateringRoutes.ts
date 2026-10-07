/**
 * modules/watering/presentation/wateringRoutes.ts
 *
 * Composition root for the watering module.
 *
 * Guest read-only access is enforced once for the whole API (guestReadOnly).
 */

import { Router } from 'express';
import { SQLiteWateringRepository } from '../infrastructure/SQLiteWateringRepository';
import { createWateringController } from './wateringController';
import { authenticateToken } from '../../../core/middleware';

export const createWateringRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteWateringRepository();
  const ctrl = createWateringController(repo);

  router.get('/fertilizer-types', authenticateToken, ctrl.getFertilizerTypes);
  router.get('/plant/:plantId', authenticateToken, ctrl.getRecordsForPlant);
  router.get('/:id', authenticateToken, ctrl.getRecord);
  router.post('/:plantId', authenticateToken, ctrl.addRecord);
  router.patch('/:id', authenticateToken, ctrl.editRecord);
  router.delete('/:id', authenticateToken, ctrl.deleteRecord);

  return router;
};
