/**
 * modules/plants/presentation/plantsController.ts
 *
 * Thin controller: parses HTTP request → calls use case → sends response.
 *
 * REST compliance:
 *  - GET    → 200 + resource
 *  - POST   → 201 + created resource + Location header
 *  - PATCH  → 200 + updated resource
 *  - DELETE → 204 No Content
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
        const userId = req.user?.id ?? null;
        const plants = await getAll.execute(userId);
        res.json({ data: plants.map((p) => p.toJSON()) });
      } catch (err) { next(err); }
    },

    getPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const plant = await getOne.execute(Number(req.params.id));
        res.json({ data: plant.toJSON() });
      } catch (err) { next(err); }
    },

    addPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        const plantId = await create.execute(req.body, userId);
        // Fetch the created resource so the client gets the full object
        const plant = await getOne.execute(plantId);
        res
          .status(201)
          .location(`/plants/${plantId}`)
          .json({ data: plant.toJSON() });
      } catch (err) { next(err); }
    },

    editPlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        const id = Number(req.params.id);
        await update.execute(id, userId, req.body);
        // Return the updated resource
        const plant = await getOne.execute(id);
        res.json({ data: plant.toJSON() });
      } catch (err) { next(err); }
    },

    deletePlant: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const userId = req.user!.id;
        await remove.execute(Number(req.params.id), userId);
        res.status(204).end();
      } catch (err) { next(err); }
    },
  };
};
