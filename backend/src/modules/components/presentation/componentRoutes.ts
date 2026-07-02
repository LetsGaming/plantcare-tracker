/**
 * modules/components/presentation/componentRoutes.ts
 *
 * Composition root for the components module. The catalogue is global,
 * so all mutations are admin-only.
 */

import { Router } from 'express';
import { SQLiteComponentRepository } from '../infrastructure/SQLiteComponentRepository';
import { createComponentController } from './componentController';
import { authenticateToken, isAdmin } from '../../../core/middleware';

export const createComponentRouter = (): Router => {
  const router = Router();
  const repo = new SQLiteComponentRepository();
  const ctrl = createComponentController(repo);

  router.get('/',                 authenticateToken,           ctrl.getAllComponents);
  router.get('/fineness-levels',  authenticateToken,           ctrl.getFinenessLevels);
  router.get('/:id',              authenticateToken,           ctrl.getComponent);
  router.post('/',                authenticateToken, isAdmin,  ctrl.addComponent);
  router.put('/:id',              authenticateToken, isAdmin,  ctrl.editComponent);
  router.delete('/:id',           authenticateToken, isAdmin,  ctrl.deleteComponent);

  return router;
};
