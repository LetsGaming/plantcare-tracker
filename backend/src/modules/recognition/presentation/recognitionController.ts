import type { FastifyReply, FastifyRequest } from 'fastify';
import { HTTP_STATUS } from '../../../core/config';
import {
  ServiceUnavailableError,
  TooManyRequestsError,
  ValidationError,
} from '../../../core/errors';
import type { Handler } from '../../../core/middleware';
import { readUpload } from '../../images/presentation/multipartUpload';
import type { ConfirmResult, ConfirmSnapshotUseCase } from '../application/ConfirmSnapshot';
import type { MatchResult, MatchSnapshotUseCase } from '../application/MatchSnapshot';
import { EmbedderBusyError } from '../infrastructure/OnnxEmbedder';

export interface RecognitionController {
  status: Handler;
  match: Handler;
  confirm: Handler;
}

const UNAVAILABLE = 'Plant recognition is not available';

export const createRecognitionController = (
  match: MatchSnapshotUseCase | null,
  confirm: ConfirmSnapshotUseCase | null,
): RecognitionController => ({
  status: async () => ({ data: { available: match !== null } }),

  match: async (req: FastifyRequest) => {
    if (!match) throw new ServiceUnavailableError(UNAVAILABLE);
    const { file } = await readUpload(req);
    if (!file) throw new ValidationError('No image file provided.');
    try {
      const data: MatchResult = await match.execute(req.user!.id, file);
      return { data };
    } catch (err) {
      if (err instanceof EmbedderBusyError) {
        throw new TooManyRequestsError('Plant recognition is busy, please try again shortly');
      }
      throw err;
    }
  },

  confirm: async (req: FastifyRequest, reply: FastifyReply) => {
    if (!confirm) throw new ServiceUnavailableError(UNAVAILABLE);
    const { id } = req.params as { id: string };
    const data: ConfirmResult = await confirm.execute(req.user!.id, id, req.body);
    return reply.code(HTTP_STATUS.CREATED).send({ data });
  },
});
