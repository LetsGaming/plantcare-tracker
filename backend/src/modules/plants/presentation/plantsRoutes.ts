/**
 * modules/plants/presentation/plantsRoutes.ts
 *
 * Composition root for the plants module: constructs the repository,
 * injects it into the controller, and attaches auth middleware.
 */

import { Router } from 'express';
import { SQLitePlantRepository } from '../infrastructure/SQLitePlantRepository';
import { SQLiteSpeciesCatalog } from '../infrastructure/SQLiteSpeciesCatalog';
import { SpeciesResolver } from '../domain/SpeciesResolver';
import { createPlantsController } from './plantsController';
import { createImageCleanup } from '../../images';
import { authenticateToken, optionalAuthenticateToken } from '../../../core/middleware';

export const createPlantsRouter = (): Router => {
  const router = Router();
  const repo = new SQLitePlantRepository((db) => new SpeciesResolver(new SQLiteSpeciesCatalog(db)));
  const ctrl = createPlantsController(repo, createImageCleanup());

  // Optional auth on reads: public plants are visible without login,
  // private plants are included when a valid token is present.
  router.get('/', optionalAuthenticateToken, ctrl.getAllPlants);
  router.get('/:id', optionalAuthenticateToken, ctrl.getPlant);
  router.post('/', authenticateToken, ctrl.addPlant);
  router.patch('/:id', authenticateToken, ctrl.editPlant);
  router.delete('/:id', authenticateToken, ctrl.deletePlant);

  return router;
};
