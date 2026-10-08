/**
 * modules/components/presentation/componentRoutes.ts
 *
 * Composition root for the components module. The catalogue is global,
 * so all mutations are admin-only.
 */

import type { FastifyPluginAsync } from 'fastify';
import { SQLiteComponentRepository } from '../infrastructure/SQLiteComponentRepository';
import { createComponentController } from './componentController';
import { createImageCleanup } from '../../images';
import { authenticateToken, isAdmin } from '../../../core/middleware';

export const componentRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLiteComponentRepository();
  const ctrl = createComponentController(repo, createImageCleanup());

  app.get('/', { onRequest: authenticateToken }, ctrl.getAllComponents);
  app.get('/fineness-levels', { onRequest: authenticateToken }, ctrl.getFinenessLevels);
  app.get('/:id', { onRequest: authenticateToken }, ctrl.getComponent);
  app.post('/', { onRequest: [authenticateToken, isAdmin] }, ctrl.addComponent);
  app.put('/:id', { onRequest: [authenticateToken, isAdmin] }, ctrl.editComponent);
  app.delete('/:id', { onRequest: [authenticateToken, isAdmin] }, ctrl.deleteComponent);
};
