/**
 * modules/plants/presentation/plantsRoutes.ts
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { MySQLPlantRepository } from '../infrastructure/MySQLPlantRepository';
import { createPlantsController } from './plantsController';
import { authenticateToken, checkGuestPermission } from '../../../core/middleware';
import type { Pool } from 'mysql2/promise';

// Optional auth: attaches req.user if token is valid, but never blocks the request.
// Used for GET / so public plants are visible without login, but private plants
// are included when a valid token is present.
const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  authenticateToken(req, _res, (err) => {
    // Ignore auth errors — treat as unauthenticated
    if (err) req.user = undefined;
    next();
  });
};

export const createPlantsRouter = (pool: Pool): Router => {
  const router = Router();
  const repo = new MySQLPlantRepository(pool);
  const ctrl = createPlantsController(repo);

  router.get('/',    optionalAuth,                                        ctrl.getAllPlants);
  router.get('/:id', optionalAuth,                                        ctrl.getPlant);
  router.post('/',   authenticateToken, checkGuestPermission,             ctrl.addPlant);
  router.patch('/:id', authenticateToken, checkGuestPermission,           ctrl.editPlant);
  router.delete('/:id', authenticateToken, checkGuestPermission,          ctrl.deletePlant);

  return router;
};
