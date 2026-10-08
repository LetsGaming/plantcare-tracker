import type { Kysely } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { Database } from '../../../core/database/schema';
import type { SpeciesCatalog, SpeciesEntry } from '../domain/SpeciesResolver';

export class SQLiteSpeciesCatalog implements SpeciesCatalog {
  /** Pass a transaction to make catalogue writes part of it. */
  constructor(private readonly db: Kysely<Database> = getKysely()) {}

  async all(): Promise<SpeciesEntry[]> {
    return this.db.selectFrom('species').select(['id', 'name']).orderBy('id').execute();
  }

  async add(name: string): Promise<number> {
    const result = await this.db.insertInto('species').values({ name }).executeTakeFirstOrThrow();
    return Number(result.insertId);
  }
}
