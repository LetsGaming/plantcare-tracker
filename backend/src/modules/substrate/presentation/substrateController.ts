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

import type { FastifyReply, FastifyRequest } from 'fastify';
import { numericParam, type Handler } from '../../../core/middleware';
import {
  ListSubstratesUseCase,
  GetSubstrateUseCase,
  CreateSubstrateUseCase,
  UpdateSubstrateUseCase,
  AddSubstrateComponentsUseCase,
  ReplaceSubstrateComponentsUseCase,
  DeleteSubstrateUseCase,
} from '../application/SubstrateUseCases';
import type { SubstrateRepository, SubstrateData, SubstrateListItem } from '../domain/Substrate';
import { toEnvelope, privateRevalidate, type ListEnvelope } from '../../../core/pagination';
import { isGuestRole } from '../../../core/auth';
import type { EntityImageCleanup } from '../../images/domain/Image';
import { HTTP_STATUS } from '../../../core/config';

// ── Response payloads (wire contract, see docs/api-reference.md) ─────────────

export type SubstrateListResponse = ListEnvelope<SubstrateListItem>;
export interface SubstrateResponse {
  data: SubstrateData;
}

/**
 * HTTP handlers exposed by the substrates module.
 *
 * Explicitly typed so the declaration emit never has to name
 * transitive express types (ParamsDictionary/ParsedQs) — those are
 * not reachable by name under pnpm's non-hoisted node_modules
 * layout (TS2883).
 */
export interface SubstrateController {
  listSubstrates: Handler;
  getSubstrate: Handler;
  addSubstrate: Handler;
  editSubstrate: Handler;
  addComponents: Handler;
  replaceComponents: Handler;
  deleteSubstrate: Handler;
}

export const createSubstrateController = (
  repo: SubstrateRepository,
  imageCleanup: EntityImageCleanup,
): SubstrateController => {
  const list = new ListSubstratesUseCase(repo);
  const getOne = new GetSubstrateUseCase(repo);
  const create = new CreateSubstrateUseCase(repo);
  const update = new UpdateSubstrateUseCase(repo);
  const addComponents = new AddSubstrateComponentsUseCase(repo);
  const replaceComponents = new ReplaceSubstrateComponentsUseCase(repo);
  const remove = new DeleteSubstrateUseCase(repo, imageCleanup);

  return {
    listSubstrates: async (req: FastifyRequest, reply: FastifyReply) => {
      const viewer = { id: req.user!.id, isGuest: isGuestRole(req.user!.role) };
      const page = await list.execute(req.query, viewer);
      privateRevalidate(reply);
      const body: SubstrateListResponse = toEnvelope(page, page.total);
      return body;
    },

    getSubstrate: async (req: FastifyRequest, reply: FastifyReply) => {
      const substrate = await getOne.execute(numericParam(req, 'id'), req.user?.id ?? null);
      privateRevalidate(reply);
      const body: SubstrateResponse = { data: substrate };
      return body;
    },

    addSubstrate: async (req: FastifyRequest, reply: FastifyReply) => {
      const substrate = await create.execute(req.body, req.user!.id);
      const body: SubstrateResponse = { data: substrate };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/substrates/${substrate.substrate_id}`)
        .send(body);
    },

    editSubstrate: async (req: FastifyRequest) => {
      const substrate = await update.execute(numericParam(req, 'id'), req.user!.id, req.body);
      const body: SubstrateResponse = { data: substrate };
      return body;
    },

    addComponents: async (req: FastifyRequest, reply: FastifyReply) => {
      const substrate = await addComponents.execute(
        numericParam(req, 'id'),
        req.user!.id,
        req.body,
      );
      const body: SubstrateResponse = { data: substrate };
      return reply
        .code(HTTP_STATUS.CREATED)
        .header('Location', `/substrates/${substrate.substrate_id}`)
        .send(body);
    },

    replaceComponents: async (req: FastifyRequest) => {
      const substrate = await replaceComponents.execute(
        numericParam(req, 'id'),
        req.user!.id,
        req.body,
      );
      const body: SubstrateResponse = { data: substrate };
      return body;
    },

    deleteSubstrate: async (req: FastifyRequest, reply: FastifyReply) => {
      await remove.execute(numericParam(req, 'id'), req.user!.id);
      return reply.code(HTTP_STATUS.NO_CONTENT).send();
    },
  };
};
