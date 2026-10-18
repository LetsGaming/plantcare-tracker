import type {
  EntityImageCleanup,
  EntityImagePurger,
  EntityType,
  ImageRepository,
  ImageStorage,
} from '../domain/Image';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('ImageCleanup');

/**
 * The one implementation of "delete every image of an entity": rows first,
 * then files. A failing row delete is a real failure (purge rejects); a
 * failing file removal only leaves an unreferenced file behind and is logged.
 */
export class ImageCleanupService implements EntityImageCleanup, EntityImagePurger {
  constructor(
    private readonly repo: ImageRepository,
    private readonly storage: ImageStorage,
  ) {}

  async purge(entityType: EntityType, entityId: number): Promise<void> {
    const images = await this.repo.deleteByEntity(entityType, entityId);
    await this.removeFiles(images.map((image) => ({ ...image, entityType })));
  }

  async removeAll(entityType: EntityType, entityId: number): Promise<void> {
    try {
      await this.purge(entityType, entityId);
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
