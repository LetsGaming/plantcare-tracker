import { getConfig, getUploadsDirectory } from '../../core/config';
import type { ImageRemovedListener, StoredImageEvent } from '../images/application/ImageUseCases';
import { EmbedImagesService } from './application/EmbedImages';
import type { Embedder, EmbeddingRepository, RecognitionLogger } from './domain/Recognition';
import { loadOnnxEmbedder } from './infrastructure/OnnxEmbedder';
import { SQLiteEmbeddingRepository } from './infrastructure/SQLiteEmbeddingRepository';
import { invalidateVectors } from './infrastructure/vectorCache';

export { recognitionRoutes } from './presentation/recognitionRoutes';
export { clearVectorCache, invalidateVectors } from './infrastructure/vectorCache';

export interface RecognitionDeps {
  /** Replaces the embedder; null disables recognition. Omitted: load the configured model. */
  embedder?: Embedder | null;
}

export interface Recognition {
  readonly embedder: Embedder | null;
  onImageStored(event: StoredImageEvent): void;
  onImageRemoved?: ImageRemovedListener;
}

export interface RecognitionContext extends Recognition {
  readonly embeddings: EmbeddingRepository;
  readonly embedImages: EmbedImagesService | null;
}

export const createRecognition = async (
  deps: RecognitionDeps,
  log: RecognitionLogger,
): Promise<RecognitionContext> => {
  const embedder =
    deps.embedder !== undefined
      ? deps.embedder
      : await loadOnnxEmbedder(
          getConfig().recognitionModelPath,
          (m) => log.warn(m),
          getConfig().uploadMaxPixels,
        );
  const embeddings = new SQLiteEmbeddingRepository();
  const embedImages = embedder
    ? new EmbedImagesService(embedder, embeddings, getUploadsDirectory(), log)
    : null;
  return {
    embedder,
    embeddings,
    embedImages,
    onImageStored: (event) => {
      if (embedImages && event.entityType === 'plant') {
        embedImages.enqueue(event.imageId, event.imageUrl);
      }
    },
    onImageRemoved: (event) => {
      if (event.entityType === 'plant') invalidateVectors(event.ownerUserId);
    },
  };
};
