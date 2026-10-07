import type { Migration, MigrationProvider } from 'kysely/migration';
import * as baseline from './0001_baseline';
import * as purgeOrphanImages from './0002_purge_orphan_images';
import * as relativeImagePaths from './0003_relative_image_paths';

/** Migrations in application order; the key is the history entry name. */
export const migrations: Record<string, Migration> = {
  '0001_baseline': baseline,
  '0002_purge_orphan_images': purgeOrphanImages,
  '0003_relative_image_paths': relativeImagePaths,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => migrations,
};
