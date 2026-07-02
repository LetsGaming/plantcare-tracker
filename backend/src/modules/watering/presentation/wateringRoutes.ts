/**
 * modules/watering/presentation/wateringRoutes.ts
 *
 * Composition root for the watering module.
 *
 * Mutations carry checkGuestPermission in line with the shared API
 * contract (guests are GET-only); previously only the plants module
 * enforced it.
 */

import { Router } from 'express';
import { SQLiteWateringRepository } from '../infrastructure/SQLiteWateringRepository';
import { createWateringController } from './wateringController';
import { authenticateToken, checkGuestPermission } from '../../../core/middleware';

export const createWateringRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteWateringRepository();
  const ctrl = createWateringController(repo);

  router.get('/fertilizer-types', authenticateToken,                        ctrl.getFertilizerTypes);
  router.get('/plant/:plantId',   authenticateToken,                        ctrl.getRecordsForPlant);
  router.get('/:id',              authenticateToken,                        ctrl.getRecord);
  router.post('/:plantId',        authenticateToken, checkGuestPermission,  ctrl.addRecord);
  router.patch('/:id',            authenticateToken, checkGuestPermission,  ctrl.editRecord);
  router.delete('/:id',           authenticateToken, checkGuestPermission,  ctrl.deleteRecord);

  return router;
};
