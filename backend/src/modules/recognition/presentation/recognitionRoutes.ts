import os from 'node:os';
import multipart from '@fastify/multipart';
import type { FastifyPluginAsync } from 'fastify';
import { getConfig, getUploadsDirectory } from '../../../core/config';
import { authenticateToken, globalErrorHandler } from '../../../core/middleware';
import { SQLiteImageRepository } from '../../images/infrastructure/SQLiteImageRepository';
import { MAX_UPLOAD_BYTES, translateUploadError } from '../../images/presentation/uploadErrors';
import { CreateWateringRecordUseCase } from '../../watering/application/WateringUseCases';
import { SQLiteWateringRepository } from '../../watering/infrastructure/SQLiteWateringRepository';
import { ConfirmSnapshotUseCase } from '../application/ConfirmSnapshot';
import { MatchSnapshotUseCase } from '../application/MatchSnapshot';
import type { Embedder } from '../domain/Recognition';
import type { RecognitionContext } from '../index';
import { TempSnapshotStore } from '../infrastructure/TempSnapshotStore';
import { createRecognitionController } from './recognitionController';

export const recognitionRoutes =
  (ctx: RecognitionContext): FastifyPluginAsync =>
  async (app) => {
    const snapshots = new TempSnapshotStore(os.tmpdir());
    await snapshots.init();
    app.addHook('onClose', async () => {
      ctx.embedImages?.stop();
      await snapshots.stop();
    });
    app.addHook('onReady', async () => {
      ctx.embedImages
        ?.backfill()
        .catch((err) => app.log.warn({ err }, 'embedding backfill failed'));
    });

    let built: {
      embedder: Embedder;
      match: MatchSnapshotUseCase;
      confirm: ConfirmSnapshotUseCase;
    } | null = null;
    const useCases = (): NonNullable<typeof built> | null => {
      const { embedder } = ctx;
      if (!embedder) return null;
      if (built?.embedder !== embedder) {
        built = {
          embedder,
          match: new MatchSnapshotUseCase(
            embedder,
            ctx.embeddings,
            snapshots,
            getConfig().uploadMaxPixels,
          ),
          confirm: new ConfirmSnapshotUseCase(
            new CreateWateringRecordUseCase(new SQLiteWateringRepository()),
            new SQLiteImageRepository(),
            ctx.embeddings,
            snapshots,
            embedder.modelId,
            getUploadsDirectory(),
            app.log,
            () => ctx.embedImages?.scheduleRescan(),
          ),
        };
      }
      return built;
    };
    const ctrl = createRecognitionController(
      () => useCases()?.match ?? null,
      () => useCases()?.confirm ?? null,
      () => ctx.embedImages?.stats() ?? null,
    );

    await app.register(multipart, {
      attachFieldsToBody: true,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    });
    app.setErrorHandler((error, request, reply) =>
      globalErrorHandler(translateUploadError(error), request, reply),
    );

    app.get('/status', { onRequest: authenticateToken }, ctrl.status);
    app.post('/match', { onRequest: authenticateToken }, ctrl.match);
    app.post('/snapshots/:id/confirm', { onRequest: authenticateToken }, ctrl.confirm);
  };
