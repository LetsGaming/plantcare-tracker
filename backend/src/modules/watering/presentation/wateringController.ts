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

import type { Request, RequestHandler, Response } from 'express';
import {
  GetFertilizerTypesUseCase,
  GetWateringRecordsForPlantUseCase,
  GetWateringRecordUseCase,
  CreateWateringRecordUseCase,
  UpdateWateringRecordUseCase,
  DeleteWateringRecordUseCase,
} from '../application/WateringUseCases';
import type {
  WateringRepository,
  WateringRecordData,
  FertilizerType,
} from '../domain/WateringRecord';
import { asyncHandler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface FertilizerTypeListResponse { data: FertilizerType[] }
export interface WateringRecordListResponse { data: WateringRecordData[] }
export interface WateringRecordResponse { data: WateringRecordData }

/**
 * HTTP handlers exposed by the watering module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface WateringController {
  getFertilizerTypes: RequestHandler;
  getRecordsForPlant: RequestHandler;
  getRecord: RequestHandler;
  addRecord: RequestHandler;
  editRecord: RequestHandler;
  deleteRecord: RequestHandler;
}

export const createWateringController = (repo: WateringRepository): WateringController => {
  const getTypes = new GetFertilizerTypesUseCase(repo);
  const getForPlant = new GetWateringRecordsForPlantUseCase(repo);
  const getOne = new GetWateringRecordUseCase(repo);
  const create = new CreateWateringRecordUseCase(repo);
  const update = new UpdateWateringRecordUseCase(repo);
  const remove = new DeleteWateringRecordUseCase(repo);

  return {
    getFertilizerTypes: asyncHandler(async (_req: Request, res: Response) => {
      const types = await getTypes.execute();
      const body: FertilizerTypeListResponse = { data: types };
      res.json(body);
    }),

    getRecordsForPlant: asyncHandler(async (req: Request, res: Response) => {
      const records = await getForPlant.execute(
        Number(req.params.plantId),
        req.user!.id,
      );
      const body: WateringRecordListResponse = { data: records };
      res.json(body);
    }),

    getRecord: asyncHandler(async (req: Request, res: Response) => {
      const record = await getOne.execute(Number(req.params.id), req.user!.id);
      const body: WateringRecordResponse = { data: record };
      res.json(body);
    }),

    addRecord: asyncHandler(async (req: Request, res: Response) => {
      const record = await create.execute(
        Number(req.params.plantId),
        req.user!.id,
        req.body,
      );
      const body: WateringRecordResponse = { data: record };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/watering/${record.record_id}`)
        .json(body);
    }),

    editRecord: asyncHandler(async (req: Request, res: Response) => {
      const record = await update.execute(
        Number(req.params.id),
        req.user!.id,
        req.body,
      );
      const body: WateringRecordResponse = { data: record };
      res.json(body);
    }),

    deleteRecord: asyncHandler(async (req: Request, res: Response) => {
      await remove.execute(Number(req.params.id), req.user!.id);
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),
  };
};
