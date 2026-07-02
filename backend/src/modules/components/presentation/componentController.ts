/**
 * modules/components/presentation/componentController.ts
 *
 * Thin controller: parse request → call use case → send response.
 *
 * REST compliance:
 *  - GET    → 200 + resource(s)
 *  - POST   → 201 + created resource + Location header
 *  - PUT    → 200 + updated resource  (full replace — only name+fineness exist)
 *  - DELETE → 204 No Content
 */

import type { Request, Response } from 'express';
import {
  GetAllComponentsUseCase,
  GetFinenessLevelsUseCase,
  GetComponentUseCase,
  CreateComponentUseCase,
  UpdateComponentUseCase,
  DeleteComponentUseCase,
} from '../application/ComponentUseCases';
import type {
  ComponentRepository,
  ComponentData,
  FinenessLevel,
} from '../domain/Component';
import { asyncHandler } from '../../../core/middleware';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface ComponentListResponse { data: ComponentData[] }
export interface ComponentResponse { data: ComponentData }
export interface FinenessLevelListResponse { data: FinenessLevel[] }

export const createComponentController = (repo: ComponentRepository) => {
  const getAll = new GetAllComponentsUseCase(repo);
  const getLevels = new GetFinenessLevelsUseCase(repo);
  const getOne = new GetComponentUseCase(repo);
  const create = new CreateComponentUseCase(repo);
  const update = new UpdateComponentUseCase(repo);
  const remove = new DeleteComponentUseCase(repo);

  return {
    getAllComponents: asyncHandler(async (_req: Request, res: Response) => {
      const components = await getAll.execute();
      const body: ComponentListResponse = { data: components };
      res.json(body);
    }),

    getFinenessLevels: asyncHandler(async (_req: Request, res: Response) => {
      const levels = await getLevels.execute();
      const body: FinenessLevelListResponse = { data: levels };
      res.json(body);
    }),

    getComponent: asyncHandler(async (req: Request, res: Response) => {
      const component = await getOne.execute(Number(req.params.id));
      const body: ComponentResponse = { data: component };
      res.json(body);
    }),

    addComponent: asyncHandler(async (req: Request, res: Response) => {
      const component = await create.execute(req.body);
      const body: ComponentResponse = { data: component };
      res
        .status(HTTP_STATUS.CREATED)
        .location(`/components/${component.component_id}`)
        .json(body);
    }),

    editComponent: asyncHandler(async (req: Request, res: Response) => {
      const component = await update.execute(Number(req.params.id), req.body);
      const body: ComponentResponse = { data: component };
      res.json(body);
    }),

    deleteComponent: asyncHandler(async (req: Request, res: Response) => {
      await remove.execute(Number(req.params.id));
      res.status(HTTP_STATUS.NO_CONTENT).end();
    }),
  };
};
