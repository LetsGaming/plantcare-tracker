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
import { authenticateToken, optionalAuthenticateToken } from '../../../core/middleware';

export const plantsRoutes: FastifyPluginAsync = async (app) => {
  const repo = new SQLitePlantRepository((db) => new SpeciesResolver(new SQLiteSpeciesCatalog(db)));
  const ctrl = createPlantsController(repo, createImageCleanup());

  // Optional auth on reads: public plants are visible without login,
  // private plants are included when a valid token is present.
  app.get('/', { onRequest: optionalAuthenticateToken }, ctrl.getAllPlants);
  app.get('/:id', { onRequest: optionalAuthenticateToken }, ctrl.getPlant);
  app.post('/', { onRequest: authenticateToken }, ctrl.addPlant);
  app.patch('/:id', { onRequest: authenticateToken }, ctrl.editPlant);
  app.delete('/:id', { onRequest: authenticateToken }, ctrl.deletePlant);
};
