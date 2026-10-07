import { ImageCleanupService } from './application/ImageCleanupService';
import { SQLiteImageRepository } from './infrastructure/SQLiteImageRepository';
import { LocalImageStorage } from './infrastructure/LocalImageStorage';
import type { EntityImageCleanup } from './domain/Image';

export type { EntityImageCleanup } from './domain/Image';

/** Composition helper for modules that delete image-owning entities. */
export const createImageCleanup = (): EntityImageCleanup =>
  new ImageCleanupService(new SQLiteImageRepository(), new LocalImageStorage());
