/**
 * modules/plants/presentation/plantsController.ts
 *
 * Thin controller: parses HTTP request → calls use case → sends response.
 * All errors are thrown as domain errors and caught by globalErrorHandler.
 * No try/catch needed in controllers anymore.
 */

import type { Request, Response, NextFunction } from 'express';
import {
  GetAllPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../application/PlantUseCases';
import type { PlantRepository } from '../domain/Plant';

export const createPlantsController = (repo: PlantRepository) => {
  const getAll = new GetAllPlantsUseCase(repo);
  const getOne = new GetPlantUseCase(repo);
  const create = new CreatePlantUseCase(repo);
  const update = new UpdatePlantUseCase(repo);
  const remove = new DeletePlantUseCase(repo);

  return {
    getAllPlants: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req as Request & { user?: { id: number } }).user?.id ?? null;
        const plants = await getAll.execute(userId);
        res.json({ success: true, data: plants.map((p) => p.toJSON()) });
      } catch (err) { next(err); }
    },

    getPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const plant = await getOne.execute(Number(req.params.id));
        res.json({ success: true, data: plant.toJSON() });
      } catch (err) { next(err); }
    },

    addPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req as Request & { user: { id: number } }).user.id;
        const plantId = await create.execute(req.body, userId);
        res.status(201).json({ success: true, data: { plantId } });
      } catch (err) { next(err); }
    },

    editPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req as Request & { user: { id: number } }).user.id;
        await update.execute(Number(req.params.id), userId, req.body);
        res.json({ success: true, data: { updated: true } });
      } catch (err) { next(err); }
    },

    deletePlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = (req as Request & { user: { id: number } }).user.id;
        await remove.execute(Number(req.params.id), userId);
        res.json({ success: true, data: { deleted: true } });
      } catch (err) { next(err); }
    },
  };
};
