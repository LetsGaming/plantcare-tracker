import { ImageCleanupService } from './application/ImageCleanupService';
import { SQLiteImageRepository } from './infrastructure/SQLiteImageRepository';
import { LocalImageStorage } from './infrastructure/LocalImageStorage';

export type { EntityImageCleanup } from './domain/Image';

/** Composition helper for modules that delete image-owning entities or their users. */
export const createImageCleanup = (): ImageCleanupService =>
  new ImageCleanupService(new SQLiteImageRepository(), new LocalImageStorage());
