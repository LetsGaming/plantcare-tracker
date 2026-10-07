import { query, execute } from '../../../core/database/db';
import type { SpeciesCatalog, SpeciesEntry } from '../domain/SpeciesResolver';

export class SQLiteSpeciesCatalog implements SpeciesCatalog {
  all(): SpeciesEntry[] {
    return query<SpeciesEntry>('SELECT id, name FROM species ORDER BY id');
  }

  add(name: string): number {
    return execute('INSERT INTO species (name) VALUES (?)', [name]).insertId;
  }
}
