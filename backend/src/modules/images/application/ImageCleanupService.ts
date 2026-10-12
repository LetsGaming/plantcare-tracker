import type {
  EntityImageCleanup,
  EntityType,
  ImageRepository,
  ImageStorage,
} from '../domain/Image';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('ImageCleanup');

/**
 * Removes the image rows of a deleted entity and then their files. It never
 * throws: the entity is already gone, so a failure here only leaves
 * unreferenced files behind and is logged for the operator.
 */
export class ImageCleanupService implements EntityImageCleanup {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async removeAll(entityType: EntityType, entityId: number): Promise<void> {
    try {
      const images = await this.repo.deleteByEntity(entityType, entityId);
      await Promise.all(
        images.map((image) => this.storage.remove(entityType, image.url, image.variants)),
      );
    } catch (err: unknown) {
      log.error(`Could not remove images of ${entityType} ${entityId}`, { err });
    }
  }

  /** Unlinks files whose rows were already deleted; failures are logged, never thrown. */
  async removeFiles(
    images: ReadonlyArray<{ entityType: EntityType; url: string; variants?: number }>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      images.map((image) => this.storage.remove(image.entityType, image.url, image.variants)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) log.error(`Could not remove ${failed} of ${images.length} image files`);
  }
}
