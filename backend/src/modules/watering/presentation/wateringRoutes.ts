/**
 * modules/watering/presentation/wateringRoutes.ts
 *
 * Composition root for the watering module.
 *
 * Guest read-only access is enforced once for the whole API (guestReadOnly).
 */

import type { FastifyPluginAsync } from 'fastify';
import { SQLiteWateringRepository } from '../infrastructure/SQLiteWateringRepository';
import { createWateringController } from './wateringController';
import { authenticateToken } from '../../../core/middleware';

export const wateringRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLiteWateringRepository();
  const ctrl = createWateringController(repo);

  app.get('/fertilizer-types', { onRequest: authenticateToken }, ctrl.getFertilizerTypes);
  app.get('/plant/:plantId', { onRequest: authenticateToken }, ctrl.getRecordsForPlant);
  app.post('/batch', { onRequest: authenticateToken }, ctrl.addBatch);
  app.post('/batch/delete', { onRequest: authenticateToken }, ctrl.deleteBatch);
  app.get('/:id', { onRequest: authenticateToken }, ctrl.getRecord);
  app.post('/:plantId', { onRequest: authenticateToken }, ctrl.addRecord);
  app.patch('/:id', { onRequest: authenticateToken }, ctrl.editRecord);
  app.delete('/:id', { onRequest: authenticateToken }, ctrl.deleteRecord);
};
