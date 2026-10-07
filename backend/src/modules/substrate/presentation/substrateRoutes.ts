/**
 * modules/substrate/presentation/substrateRoutes.ts
 *
 * Composition root for the substrate module.
 *
 * Guest read-only access is enforced once for the whole API (guestReadOnly).
 */

import { Router } from 'express';
import { SQLiteSubstrateRepository } from '../infrastructure/SQLiteSubstrateRepository';
import { createSubstrateController } from './substrateController';
import { createImageCleanup } from '../../images';
import { authenticateToken } from '../../../core/middleware';

export const createSubstrateRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteSubstrateRepository();
  const ctrl = createSubstrateController(repo, createImageCleanup());

  router.get('/', authenticateToken, ctrl.getAllSubstrates);
  router.get('/:id', authenticateToken, ctrl.getSubstrate);
  router.post('/', authenticateToken, ctrl.addSubstrate);
  router.patch('/:id', authenticateToken, ctrl.editSubstrate);
  router.post('/:id/components', authenticateToken, ctrl.addComponents);
  router.patch('/:id/components', authenticateToken, ctrl.upsertComponents);
  router.delete('/:id', authenticateToken, ctrl.deleteSubstrate);

  return router;
};
