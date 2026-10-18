import type BetterSqlite3 from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import type { SqliteDatabase, SqliteStatement } from 'kysely';

export const STATEMENT_CACHE_CAPACITY = 200;

const UNCACHED_SQL =
  /^\s*(?:create|alter|drop|pragma|vacuum|reindex|analyze|attach|detach|begin|commit|end|rollback|savepoint|release)\b/i;

/**
 * Wraps a better-sqlite3 handle so repeated SQL text reuses one prepared statement
 * (bounded LRU, keyed by SQL text). Schema changes are safe: better-sqlite3 re-prepares
 * a stale statement itself.
 */
export class CachedSqliteDatabase implements SqliteDatabase {
  private readonly statements = new Map<string, SqliteStatement>();

  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly capacity: number = STATEMENT_CACHE_CAPACITY,
  ) {}

  get size(): number {
    return this.statements.size;
  }

  clear(): void {
    this.statements.clear();
  }

  prepare(sql: string): SqliteStatement {
    if (UNCACHED_SQL.test(sql)) return this.db.prepare(sql);

    const cached = this.statements.get(sql);
    if (cached) {
      this.statements.delete(sql);
      this.statements.set(sql, cached);
      return cached;
    }

    const stmt = this.wrap(sql, this.db.prepare(sql));
    this.statements.set(sql, stmt);
    if (this.statements.size > this.capacity) {
      const oldest = this.statements.keys().next().value;
      if (oldest !== undefined) this.statements.delete(oldest);
    }
    return stmt;
  }

  close(): void {
    this.clear();
    this.db.close();
  }

  // A statement cannot run again while one of its iterators is open, so streams get a private statement.
  private wrap(sql: string, stmt: BetterSqlite3.Statement): SqliteStatement {
    return {
      reader: stmt.reader,
      all: (parameters) => stmt.all(parameters as unknown[]),
      run: (parameters) => stmt.run(parameters as unknown[]),
      iterate: (parameters) => this.db.prepare(sql).iterate(parameters as unknown[]),
    };
  }
}

export const createCachedSqliteDialect = (
  db: BetterSqlite3.Database,
  capacity?: number,
): { dialect: SqliteDialect; statements: CachedSqliteDatabase } => {
  const statements = new CachedSqliteDatabase(db, capacity);
  return { dialect: new SqliteDialect({ database: statements }), statements };
};
