import { getKysely } from '../../../core/database/db';
import type { SpeciesCatalog, SpeciesEntry } from '../domain/SpeciesResolver';

export class SQLiteSpeciesCatalog implements SpeciesCatalog {
  async all(): Promise<SpeciesEntry[]> {
    return getKysely().selectFrom('species').select(['id', 'name']).orderBy('id').execute();
  }

  async add(name: string): Promise<number> {
    const result = await getKysely()
      .insertInto('species')
      .values({ name })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }
}
