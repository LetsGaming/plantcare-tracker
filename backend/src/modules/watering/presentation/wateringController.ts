/**
 * modules/watering/presentation/wateringController.ts
 *
 * Thin controller: parse request → call use case → send response.
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created record + Location header
 *  - PATCH  → 200 + updated record
 *  - DELETE → 204 No Content
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { numericParam, type Handler } from '../../../core/middleware';
import {
  GetFertilizerTypesUseCase,
  GetWateringRecordsForPlantUseCase,
  GetWateringRecordUseCase,
  CreateWateringRecordUseCase,
  UpdateWateringRecordUseCase,
  DeleteWateringRecordUseCase,
  CreateWateringBatchUseCase,
  DeleteWateringBatchUseCase,
} from '../application/WateringUseCases';
import type {
  WateringRepository,
  WateringRecordData,
  FertilizerType,
} from '../domain/WateringRecord';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface FertilizerTypeListResponse {
  data: FertilizerType[];
}
export interface WateringRecordListResponse {
  data: WateringRecordData[];
}
export interface WateringRecordResponse {
  data: WateringRecordData;
}
export interface WateringBatchResponse {
  data: { ids: number[] };
}

/**
 * HTTP handlers exposed by the watering module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface WateringController {
  getFertilizerTypes: Handler;
  getRecordsForPlant: Handler;
  getRecord: Handler;
  addRecord: Handler;
  editRecord: Handler;
  deleteRecord: Handler;
  addBatch: Handler;
  deleteBatch: Handler;
}

export const createWateringController = (repo: WateringRepository): WateringController => {
  const getTypes = new GetFertilizerTypesUseCase(repo);
  const getForPlant = new GetWateringRecordsForPlantUseCase(repo);
  const getOne = new GetWateringRecordUseCase(repo);
  const create = new CreateWateringRecordUseCase(repo);
  const update = new UpdateWateringRecordUseCase(repo);
  const remove = new DeleteWateringRecordUseCase(repo);
  const createBatch = new CreateWateringBatchUseCase(repo);
  const deleteBatch = new DeleteWateringBatchUseCase(repo);

  return {
    getFertilizerTypes: async () => {
      const types = await getTypes.execute();
      const body: FertilizerTypeListResponse = { data: types };
      return body;
    },

    getRecordsForPlant: async (req: FastifyRequest) => {
      const records = await getForPlant.execute(numericParam(req, 'plantId'), req.user!.id);
      const body: WateringRecordListResponse = { data: records };
      return body;
    },

    getRecord: async (req: FastifyRequest) => {
      const record = await getOne.execute(numericParam(req, 'id'), req.user!.id);
      const body: WateringRecordResponse = { data: record };
      return body;
    },

    addRecord: async (req: FastifyRequest, reply: FastifyReply) => {
      const record = await create.execute(numericParam(req, 'plantId'), req.user!.id, req.body);
      const body: WateringRecordResponse = { data: record };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/watering/${record.record_id}`)
        .send(body);
    },

    editRecord: async (req: FastifyRequest) => {
      const record = await update.execute(numericParam(req, 'id'), req.user!.id, req.body);
      const body: WateringRecordResponse = { data: record };
      return body;
    },

    deleteRecord: async (req: FastifyRequest, reply: FastifyReply) => {
      await remove.execute(numericParam(req, 'id'), req.user!.id);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },

    addBatch: async (req: FastifyRequest, reply: FastifyReply) => {
      const ids = await createBatch.execute(req.user!.id, req.body);
      const body: WateringBatchResponse = { data: { ids } };
      return reply.code(HTTP_STATUS.CREATED).send(body);
    },

    deleteBatch: async (req: FastifyRequest, reply: FastifyReply) => {
      await deleteBatch.execute(req.user!.id, req.body);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  };
};
