/**
 * modules/plants/presentation/plantsRoutes.ts
 *
 * Composition root for the plants module: constructs the repository,
 * injects it into the controller, and attaches auth hooks.
 */

import type { FastifyPluginAsync } from 'fastify';
import { SQLitePlantRepository } from '../infrastructure/SQLitePlantRepository';
import { SQLiteSpeciesCatalog } from '../infrastructure/SQLiteSpeciesCatalog';
import { SpeciesResolver } from '../domain/SpeciesResolver';
import { createPlantsController } from './plantsController';
import { createImageCleanup } from '../../images';
import { invalidateVectors } from '../../recognition';
import { authenticateToken, optionalAuthenticateToken } from '../../../core/middleware';

export const plantsRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLitePlantRepository((db) => new SpeciesResolver(new SQLiteSpeciesCatalog(db)));
  const ctrl = createPlantsController(repo, createImageCleanup(), invalidateVectors);

  // Optional auth on reads: public plants are visible without login, and a
  // valid token adds the caller's own plants (scope=mine) and their summaries.
  app.get('/', { onRequest: optionalAuthenticateToken }, ctrl.getAllPlants);
  app.get('/:id', { onRequest: optionalAuthenticateToken }, ctrl.getPlant);
  app.post('/', { onRequest: authenticateToken }, ctrl.addPlant);
  app.patch('/:id', { onRequest: authenticateToken }, ctrl.editPlant);
  app.delete('/:id', { onRequest: authenticateToken }, ctrl.deletePlant);
};
