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
      await Promise.all(images.map((image) => this.storage.remove(entityType, image.url)));
    } catch (err: unknown) {
      log.error(`Could not remove images of ${entityType} ${entityId}`, { err });
    }
  }
}
