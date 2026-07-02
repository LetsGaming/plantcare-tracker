/**
 * modules/plants/presentation/plantsController.ts
 *
 * Thin controller: parses HTTP request → calls use case → sends response.
 * asyncHandler forwards any rejection to the global error handler, so
 * handler bodies contain only the happy path.
 *
 * REST compliance:
 *  - GET    → 200 + resource
 *  - POST   → 201 + created resource + Location header
 *  - PATCH  → 200 + updated resource
 *  - DELETE → 204 No Content
 */

import type { Request, RequestHandler, Response } from 'express';
import {
  GetAllPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../application/PlantUseCases';
import type { PlantRepository, PlantData } from '../domain/Plant';
import { asyncHandler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface PlantListResponse { data: PlantData[] }
export interface PlantResponse { data: PlantData }

/**
 * HTTP handlers exposed by the plants module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface PlantsController {
  getAllPlants: RequestHandler;
  getPlant: RequestHandler;
  addPlant: RequestHandler;
  editPlant: RequestHandler;
  deletePlant: RequestHandler;
}

export const createPlantsController = (repo: PlantRepository): PlantsController => {
  const getAll = new GetAllPlantsUseCase(repo);
  const getOne = new GetPlantUseCase(repo);
  const create = new CreatePlantUseCase(repo);
  const update = new UpdatePlantUseCase(repo);
  const remove = new DeletePlantUseCase(repo);

  return {
    getAllPlants: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user?.id ?? null;
      const plants = await getAll.execute(userId);
      const body: PlantListResponse = { data: plants.map((p) => p.toJSON()) };
      res.json(body);
    }),

    getPlant: asyncHandler(async (req: Request, res: Response) => {
      const plant = await getOne.execute(Number(req.params.id));
      const body: PlantResponse = { data: plant.toJSON() };
      res.json(body);
    }),

    addPlant: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const plant = await create.execute(req.body, userId);
      const body: PlantResponse = { data: plant.toJSON() };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/plants/${plant.id}`)
        .json(body);
    }),

    editPlant: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user!.id;
      const plant = await update.execute(Number(req.params.id), userId, req.body);
      const body: PlantResponse = { data: plant.toJSON() };
      res.json(body);
    }),

    deletePlant: asyncHandler(async (req: Request, res: Response) => {
      const userId = req.user!.id;
      await remove.execute(Number(req.params.id), userId);
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),
  };
};
