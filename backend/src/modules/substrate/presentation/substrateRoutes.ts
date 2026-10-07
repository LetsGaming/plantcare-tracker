/**
 * modules/substrate/presentation/substrateRoutes.ts
 *
 * Composition root for the substrate module.
 *
 * Guest read-only access is enforced once for the whole API (guestReadOnly).
 */

import type { FastifyPluginAsync } from 'fastify';
import { SQLiteSubstrateRepository } from '../infrastructure/SQLiteSubstrateRepository';
import { createSubstrateController } from './substrateController';
import { createImageCleanup } from '../../images';
import { authenticateToken } from '../../../core/middleware';

export const substrateRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLiteSubstrateRepository();
  const ctrl = createSubstrateController(repo, createImageCleanup());

  app.get('/', { onRequest: authenticateToken }, ctrl.getAllSubstrates);
  app.get('/:id', { onRequest: authenticateToken }, ctrl.getSubstrate);
  app.post('/', { onRequest: authenticateToken }, ctrl.addSubstrate);
  app.patch('/:id', { onRequest: authenticateToken }, ctrl.editSubstrate);
  app.post('/:id/components', { onRequest: authenticateToken }, ctrl.addComponents);
  app.patch('/:id/components', { onRequest: authenticateToken }, ctrl.upsertComponents);
  app.delete('/:id', { onRequest: authenticateToken }, ctrl.deleteSubstrate);
};
