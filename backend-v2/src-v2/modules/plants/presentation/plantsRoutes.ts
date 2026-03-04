/**
 * modules/plants/presentation/plantsRoutes.ts
 */

import { Router } from 'express';
import { MySQLPlantRepository } from '../infrastructure/MySQLPlantRepository';
import { createPlantsController } from './plantsController';
import type { Pool } from 'mysql2/promise';

export const createPlantsRouter = (pool: Pool): Router => {
  const router = Router();
  const repo = new MySQLPlantRepository(pool);
  const ctrl = createPlantsController(repo);

  router.get('/', ctrl.getAllPlants);
  router.get('/:id', ctrl.getPlant);
  router.post('/', ctrl.addPlant);
  router.patch('/:id', ctrl.editPlant);
  router.delete('/:id', ctrl.deletePlant);

  return router;
};
