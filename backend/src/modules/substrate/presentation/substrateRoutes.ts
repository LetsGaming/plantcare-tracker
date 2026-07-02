/**
 * modules/substrate/presentation/substrateRoutes.ts
 *
 * Composition root for the substrate module.
 *
 * Mutations carry checkGuestPermission in line with the shared API
 * contract (guests are GET-only).
 */

import { Router } from 'express';
import { SQLiteSubstrateRepository } from '../infrastructure/SQLiteSubstrateRepository';
import { createSubstrateController } from './substrateController';
import { authenticateToken, checkGuestPermission } from '../../../core/middleware';

export const createSubstrateRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteSubstrateRepository();
  const ctrl = createSubstrateController(repo);

  router.get('/',                  authenticateToken,                        ctrl.getAllSubstrates);
  router.get('/:id',               authenticateToken,                        ctrl.getSubstrate);
  router.post('/',                 authenticateToken, checkGuestPermission,  ctrl.addSubstrate);
  router.patch('/:id',             authenticateToken, checkGuestPermission,  ctrl.editSubstrate);
  router.post('/:id/components',   authenticateToken, checkGuestPermission,  ctrl.addComponents);
  router.patch('/:id/components',  authenticateToken, checkGuestPermission,  ctrl.upsertComponents);
  router.delete('/:id',            authenticateToken, checkGuestPermission,  ctrl.deleteSubstrate);

  return router;
};
