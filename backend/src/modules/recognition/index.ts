import { getConfig } from '../../core/config';
import type { ImageRemovedListener, StoredImageEvent } from '../images/application/ImageUseCases';
import { LocalImageStorage } from '../images/infrastructure/LocalImageStorage';
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
  /** Replaces the model loader used when no embedder is given. */
  loadEmbedder?: () => Promise<Embedder | null>;
}

export interface Recognition {
  readonly embedder: Embedder | null;
  onImageStored(event: StoredImageEvent): void;
  onImageRemoved: ImageRemovedListener;
}

export interface RecognitionContext extends Recognition {
  readonly embeddings: EmbeddingRepository;
  readonly embedImages: EmbedImagesService | null;
  /** False until the configured model finished loading (or failed to load). */
  readonly ready: boolean;
  /** Loads the configured model once; resolves when recognition is usable or disabled. */
  load(): Promise<void>;
}

export const createRecognition = (
  deps: RecognitionDeps,
  log: RecognitionLogger,
): RecognitionContext => {
  const { recognitionModelPath, uploadMaxPixels } = getConfig();
  const loader =
    deps.loadEmbedder ??
    (() => loadOnnxEmbedder(recognitionModelPath, (m) => log.warn(m), uploadMaxPixels));
  const embeddings = new SQLiteEmbeddingRepository();
  let embedder: Embedder | null = null;
  let embedImages: EmbedImagesService | null = null;
  let ready = false;
  let loading: Promise<void> | null = null;

  const install = (loaded: Embedder | null): void => {
    embedder = loaded;
    embedImages = loaded
      ? new EmbedImagesService(loaded, embeddings, new LocalImageStorage(), log)
      : null;
    ready = true;
  };

  const load = (): Promise<void> => {
    loading ??= (async () => {
      try {
        install(await loader());
      } catch (err) {
        log.warn({ err }, 'plant recognition failed to load');
        install(null);
      }
      embedImages?.backfill().catch((err) => log.warn({ err }, 'embedding backfill failed'));
    })();
    return loading;
  };

  if (deps.embedder !== undefined) install(deps.embedder);
  else if (!deps.loadEmbedder && !recognitionModelPath) install(null);

  return {
    get embedder() {
      return embedder;
    },
    get embedImages() {
      return embedImages;
    },
    get ready() {
      return ready;
    },
    load,
    embeddings,
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
