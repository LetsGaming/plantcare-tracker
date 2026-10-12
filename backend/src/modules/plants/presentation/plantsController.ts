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
import { isGuestRole } from '../../../core/auth';
import {
  parseListQuery,
  privateRevalidate,
  toEnvelope,
  type ListEnvelope,
} from '../../../core/pagination';
import {
  ListPlantsUseCase,
  GetPlantUseCase,
  CreatePlantUseCase,
  UpdatePlantUseCase,
  DeletePlantUseCase,
} from '../application/PlantUseCases';
import type {
  PlantData,
  PlantListItem,
  PlantRepository,
  PlantScope,
  PlantSort,
} from '../domain/Plant';
import { parseTzOffset } from '../domain/wateringSummary';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { HTTP_STATUS } from '../../../core/config';

const PLANT_SORTS = {
  created: { valueType: 'number', idType: 'number', direction: 'desc' },
  name: { valueType: 'string', idType: 'number', direction: 'asc' },
} as const;
const PLANT_SCOPES: readonly PlantScope[] = ['mine', 'public'];

const tzOf = (req: FastifyRequest): number =>
  parseTzOffset((req.query as Record<string, unknown> | undefined)?.tz_offset);

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export type PlantListResponse = ListEnvelope<PlantListItem>;
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
  const list = new ListPlantsUseCase(repo);
  const getOne = new GetPlantUseCase(repo);
  const create = new CreatePlantUseCase(repo);
  const update = new UpdatePlantUseCase(repo);
  const remove = new DeletePlantUseCase(repo, imageCleanup);

  return {
    getAllPlants: async (req: FastifyRequest, reply: FastifyReply) => {
      // Guests own no plants, so their scope=mine is an empty page rather than an error.
      const viewerId = req.user && !isGuestRole(req.user.role) ? req.user.id : null;
      const { scope, ...query } = parseListQuery<PlantSort, PlantScope>(req.query, {
        sorts: PLANT_SORTS,
        defaultSort: 'created',
        scopes: PLANT_SCOPES,
        defaultScope: viewerId === null ? 'public' : 'mine',
      });
      const page = await list.execute(scope ?? 'public', query, viewerId, tzOf(req));
      privateRevalidate(reply);
      const body: PlantListResponse = toEnvelope(page, page.total);
      return body;
    },

    getPlant: async (req: FastifyRequest, reply: FastifyReply) => {
      const plant = await getOne.execute(numericParam(req, 'id'), req.user?.id ?? null, tzOf(req));
      privateRevalidate(reply);
      const body: PlantResponse = { data: plant.toJSON() };
      return body;
    },

    addPlant: async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user!.id;
      const plant = await create.execute(req.body, userId, tzOf(req));
      const body: PlantResponse = { data: plant.toJSON() };
      return reply.code(HTTP_STATUS.CREATED).header('Location', `/plants/${plant.id}`).send(body);
    },

    editPlant: async (req: FastifyRequest) => {
      const userId = req.user!.id;
      const plant = await update.execute(numericParam(req, 'id'), userId, req.body, tzOf(req));
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
