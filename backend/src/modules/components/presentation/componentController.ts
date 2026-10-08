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

import type { FastifyReply, FastifyRequest } from 'fastify';
import { numericParam, type Handler } from '../../../core/middleware';
import {
  GetAllComponentsUseCase,
  GetFinenessLevelsUseCase,
  GetComponentUseCase,
  CreateComponentUseCase,
  UpdateComponentUseCase,
  DeleteComponentUseCase,
} from '../application/ComponentUseCases';
import type { ComponentRepository, ComponentData, FinenessLevel } from '../domain/Component';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export interface ComponentListResponse {
  data: ComponentData[];
}
export interface ComponentResponse {
  data: ComponentData;
}
export interface FinenessLevelListResponse {
  data: FinenessLevel[];
}

/**
 * HTTP handlers exposed by the components module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface ComponentController {
  getAllComponents: Handler;
  getFinenessLevels: Handler;
  getComponent: Handler;
  addComponent: Handler;
  editComponent: Handler;
  deleteComponent: Handler;
}

export const createComponentController = (
  repo: ComponentRepository,
  imageCleanup: EntityImageCleanup,
): ComponentController => {
  const getAll = new GetAllComponentsUseCase(repo);
  const getLevels = new GetFinenessLevelsUseCase(repo);
  const getOne = new GetComponentUseCase(repo);
  const create = new CreateComponentUseCase(repo);
  const update = new UpdateComponentUseCase(repo);
  const remove = new DeleteComponentUseCase(repo, imageCleanup);

  return {
    getAllComponents: async () => {
      const components = await getAll.execute();
      const body: ComponentListResponse = { data: components };
      return body;
    },

    getFinenessLevels: async () => {
      const levels = await getLevels.execute();
      const body: FinenessLevelListResponse = { data: levels };
      return body;
    },

    getComponent: async (req: FastifyRequest) => {
      const component = await getOne.execute(numericParam(req, 'id'));
      const body: ComponentResponse = { data: component };
      return body;
    },

    addComponent: async (req: FastifyRequest, reply: FastifyReply) => {
      const component = await create.execute(req.body);
      const body: ComponentResponse = { data: component };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/components/${component.component_id}`)
        .send(body);
    },

    editComponent: async (req: FastifyRequest) => {
      const component = await update.execute(numericParam(req, 'id'), req.body);
      const body: ComponentResponse = { data: component };
      return body;
    },

    deleteComponent: async (req: FastifyRequest, reply: FastifyReply) => {
      await remove.execute(numericParam(req, 'id'));
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  };
};
