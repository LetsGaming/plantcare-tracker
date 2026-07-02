/**
 * modules/substrate/presentation/substrateController.ts
 *
 * Thin controller: parse request → call use case → send response.
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created resource + Location header
 *  - PATCH  → 200 + updated resource
 *  - DELETE → 204 No Content
 */

import type { Request, RequestHandler, Response } from 'express';
import {
  GetAllSubstratesUseCase,
  GetSubstrateUseCase,
  CreateSubstrateUseCase,
  UpdateSubstrateUseCase,
  AddSubstrateComponentsUseCase,
  UpsertSubstrateComponentsUseCase,
  DeleteSubstrateUseCase,
} from '../application/SubstrateUseCases';
import type { SubstrateRepository, SubstrateData } from '../domain/Substrate';
import { asyncHandler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface SubstrateListResponse { data: SubstrateData[] }
export interface SubstrateResponse { data: SubstrateData }

/**
 * HTTP handlers exposed by the substrates module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface SubstrateController {
  getAllSubstrates: RequestHandler;
  getSubstrate: RequestHandler;
  addSubstrate: RequestHandler;
  editSubstrate: RequestHandler;
  addComponents: RequestHandler;
  upsertComponents: RequestHandler;
  deleteSubstrate: RequestHandler;
}

export const createSubstrateController = (repo: SubstrateRepository): SubstrateController => {
  const getAll = new GetAllSubstratesUseCase(repo);
  const getOne = new GetSubstrateUseCase(repo);
  const create = new CreateSubstrateUseCase(repo);
  const update = new UpdateSubstrateUseCase(repo);
  const addComponents = new AddSubstrateComponentsUseCase(repo);
  const upsertComponents = new UpsertSubstrateComponentsUseCase(repo);
  const remove = new DeleteSubstrateUseCase(repo);

  return {
    getAllSubstrates: asyncHandler(async (req: Request, res: Response) => {
      const substrates = await getAll.execute(req.user?.id ?? null);
      const body: SubstrateListResponse = { data: substrates };
      res.json(body);
    }),

    getSubstrate: asyncHandler(async (req: Request, res: Response) => {
      const substrate = await getOne.execute(Number(req.params.id));
      const body: SubstrateResponse = { data: substrate };
      res.json(body);
    }),

    addSubstrate: asyncHandler(async (req: Request, res: Response) => {
      const substrate = await create.execute(req.body, req.user!.id);
      const body: SubstrateResponse = { data: substrate };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/substrates/${substrate.substrate_id}`)
        .json(body);
    }),

    editSubstrate: asyncHandler(async (req: Request, res: Response) => {
      const substrate = await update.execute(
        Number(req.params.id),
        req.user!.id,
        req.body,
      );
      const body: SubstrateResponse = { data: substrate };
      res.json(body);
    }),

    addComponents: asyncHandler(async (req: Request, res: Response) => {
      const substrate = await addComponents.execute(
        Number(req.params.id),
        req.user!.id,
        req.body,
      );
      const body: SubstrateResponse = { data: substrate };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/substrates/${substrate.substrate_id}`)
        .json(body);
    }),

    upsertComponents: asyncHandler(async (req: Request, res: Response) => {
      const substrate = await upsertComponents.execute(
        Number(req.params.id),
        req.user!.id,
        req.body,
      );
      const body: SubstrateResponse = { data: substrate };
      res.json(body);
    }),

    deleteSubstrate: asyncHandler(async (req: Request, res: Response) => {
      await remove.execute(Number(req.params.id), req.user!.id);
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),
  };
};
