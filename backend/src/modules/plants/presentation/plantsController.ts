/**
 * modules/plants/presentation/plantsController.ts
 *
 * Thin controller: parses HTTP request → calls use case → sends response.
 * Express 5 forwards rejected handler promises to the global error handler,
 * so handler bodies contain only the happy path.
 *
 * REST compliance:
 *  - GET    → 200 + resource
 *  - POST   → 201 + created resource + Location header
 *  - PATCH  → 200 + updated resource
 *  - DELETE → 204 No Content
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { numericParam, type Handler } from '../../../core/middleware';
import {
  GetAllPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../application/PlantUseCases';
import type { PlantRepository, PlantData } from '../domain/Plant';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface PlantListResponse {
  data: PlantData[];
}
export interface PlantResponse {
  data: PlantData;
}

/**
 * HTTP handlers exposed by the plants module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface PlantsController {
  getAllPlants: Handler;
  getPlant: Handler;
  addPlant: Handler;
  editPlant: Handler;
  deletePlant: Handler;
}

export const createPlantsController = (
  repo: PlantRepository,
  imageCleanup: EntityImageCleanup,
): PlantsController => {
  const getAll = new GetAllPlantsUseCase(repo);
  const getOne = new GetPlantUseCase(repo);
  const create = new CreatePlantUseCase(repo);
  const update = new UpdatePlantUseCase(repo);
  const remove = new DeletePlantUseCase(repo, imageCleanup);

  return {
    getAllPlants: async (req: FastifyRequest) => {
      const userId = req.user?.id ?? null;
      const plants = await getAll.execute(userId);
      const body: PlantListResponse = { data: plants.map((p) => p.toJSON()) };
      return body;
    },

    getPlant: async (req: FastifyRequest) => {
      const plant = await getOne.execute(numericParam(req, 'id'), req.user?.id ?? null);
      const body: PlantResponse = { data: plant.toJSON() };
      return body;
    },

    addPlant: async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user!.id;
      const plant = await create.execute(req.body, userId);
      const body: PlantResponse = { data: plant.toJSON() };
      return reply.code(HTTP_STATUS.CREATED).header('Location', `/plants/${plant.id}`).send(body);
    },

    editPlant: async (req: FastifyRequest) => {
      const userId = req.user!.id;
      const plant = await update.execute(numericParam(req, 'id'), userId, req.body);
      const body: PlantResponse = { data: plant.toJSON() };
      return body;
    },

    deletePlant: async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user!.id;
      await remove.execute(numericParam(req, 'id'), userId);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  };
};
