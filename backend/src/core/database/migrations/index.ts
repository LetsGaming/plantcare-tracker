import type { Migration, MigrationProvider } from 'kysely/migration';
import * as baseline from './0001_baseline';
import * as purgeOrphanImages from './0002_purge_orphan_images';
import * as relativeImagePaths from './0003_relative_image_paths';
import * as sourceHealthIssues from './0004_source_health_issues';
import * as imageEmbeddings from './0005_image_embeddings';
import * as listIndexes from './0006_list_indexes';
import * as imageVariants from './0007_image_variants';
import * as sales from './0008_sales';
import * as sessions from './0009_sessions';

/** Migrations in application order; the key is the history entry name. */
export const migrations: Record<string, Migration> = {
  '0001_baseline': baseline,
  '0002_purge_orphan_images': purgeOrphanImages,
  '0003_relative_image_paths': relativeImagePaths,
  '0004_source_health_issues': sourceHealthIssues,
  '0005_image_embeddings': imageEmbeddings,
  '0006_list_indexes': listIndexes,
  '0007_image_variants': imageVariants,
  '0008_sales': sales,
  '0009_sessions': sessions,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => migrations,
};
