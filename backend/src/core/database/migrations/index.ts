import type { Migration, MigrationProvider } from 'kysely/migration';
import * as baseline from './0001_baseline';

/** Migrations in application order; the key is the history entry name. */
export const migrations: Record<string, Migration> = {
  '0001_baseline': baseline,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => migrations,
};
