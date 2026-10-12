/**
 * modules/watering/presentation/wateringController.ts
 *
 * Thin controller: parse request → call use case → send response.
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + changed records and summaries + Location header (single add)
 *  - PATCH  → 200 + updated record and summary
 *  - DELETE → 200 + summary of the affected plant
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { numericParam, type Handler } from '../../../core/middleware';
import { parseListQuery, privateRevalidate, toEnvelope } from '../../../core/pagination';
import type { ListEnvelope } from '../../../core/pagination';
import {
  GetFertilizerTypesUseCase,
  GetWateringHistoryUseCase,
  GetWateringRecordUseCase,
  CreateWateringRecordUseCase,
  UpdateWateringRecordUseCase,
  DeleteWateringRecordUseCase,
  CreateWateringBatchUseCase,
  DeleteWateringBatchUseCase,
  type WateringBatchResult,
  type WateringWriteResult,
} from '../application/WateringUseCases';
import type {
  WateringRepository,
  WateringItem,
  WateringSummaries,
  FertilizerType,
} from '../domain/WateringRecord';
import type { WateringSummary } from '../../plants/domain/wateringSummary';
import { HTTP_STATUS } from '../../../core/config';

const HISTORY_DEFAULT_LIMIT = 50;
const HISTORY_SORTS = { date: { valueType: 'number', idType: 'number' } } as const;
const FERTILIZER_TYPES_MAX_AGE_SECONDS = 3600;

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface FertilizerTypeListResponse {
  data: FertilizerType[];
}
export type WateringHistoryResponse = ListEnvelope<WateringItem>;
export interface WateringItemResponse {
  data: WateringItem;
}
export interface WateringWriteResponse {
  data: WateringWriteResult;
}
export interface WateringDeleteResponse {
  data: { summary: WateringSummary };
}
export interface WateringBatchResponse {
  data: WateringBatchResult;
}
export interface WateringBatchDeleteResponse {
  data: { summaries: WateringSummaries };
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
  const getHistory = new GetWateringHistoryUseCase(repo);
  const getOne = new GetWateringRecordUseCase(repo);
  const create = new CreateWateringRecordUseCase(repo);
  const update = new UpdateWateringRecordUseCase(repo);
  const remove = new DeleteWateringRecordUseCase(repo);
  const createBatch = new CreateWateringBatchUseCase(repo);
  const deleteBatch = new DeleteWateringBatchUseCase(repo);

  return {
    getFertilizerTypes: async (_req: FastifyRequest, reply: FastifyReply) => {
      const types = await getTypes.execute();
      reply.header('Cache-Control', `private, max-age=${FERTILIZER_TYPES_MAX_AGE_SECONDS}`);
      const body: FertilizerTypeListResponse = { data: types };
      return body;
    },

    getRecordsForPlant: async (req: FastifyRequest, reply: FastifyReply) => {
      const { limit, cursor } = parseListQuery(req.query, {
        sorts: HISTORY_SORTS,
        defaultSort: 'date',
        cursorParam: 'before',
        defaultLimit: HISTORY_DEFAULT_LIMIT,
      });
      const page = await getHistory.execute(numericParam(req, 'plantId'), req.user!.id, {
        limit,
        cursor,
      });
      privateRevalidate(reply);
      const body: WateringHistoryResponse = toEnvelope(page, page.total);
      return body;
    },

    getRecord: async (req: FastifyRequest) => {
      const record = await getOne.execute(numericParam(req, 'id'), req.user!.id);
      const body: WateringItemResponse = { data: record };
      return body;
    },

    addRecord: async (req: FastifyRequest, reply: FastifyReply) => {
      const result = await create.execute(numericParam(req, 'plantId'), req.user!.id, req.body);
      const body: WateringWriteResponse = { data: result };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/watering/${result.record.id}`)
        .send(body);
    },

    editRecord: async (req: FastifyRequest) => {
      const result = await update.execute(numericParam(req, 'id'), req.user!.id, req.body);
      const body: WateringWriteResponse = { data: result };
      return body;
    },

    deleteRecord: async (req: FastifyRequest) => {
      const tz = (req.query as Record<string, unknown> | undefined)?.tz_offset;
      const result = await remove.execute(numericParam(req, 'id'), req.user!.id, tz);
      const body: WateringDeleteResponse = { data: result };
      return body;
    },

    addBatch: async (req: FastifyRequest, reply: FastifyReply) => {
      const result = await createBatch.execute(req.user!.id, req.body);
      const body: WateringBatchResponse = { data: result };
      return reply.code(HTTP_STATUS.CREATED).send(body);
    },

    deleteBatch: async (req: FastifyRequest) => {
      const result = await deleteBatch.execute(req.user!.id, req.body);
      const body: WateringBatchDeleteResponse = { data: result };
      return body;
    },
  };
};
