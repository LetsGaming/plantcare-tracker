/**
 * modules/auth/infrastructure/SQLiteUserRepository.ts
 */

import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { UserRepository, UserData } from '../domain/User';

/** The shared guest account is never edited or removed through the API. */
const notGuest = sql<boolean>`role_id <> COALESCE((SELECT id FROM roles WHERE name = 'guest' COLLATE NOCASE), -1)`;

export class SQLiteUserRepository implements UserRepository {
  async findByUsername(username: string): Promise<UserData | null> {
    const row = await getKysely()
      .selectFrom('users')
      .leftJoin('roles', 'users.role_id', 'roles.id')
      .select(['users.id', 'users.username', 'users.password', 'roles.name as role'])
      .where('users.username', '=', username)
      .executeTakeFirst();
    return row ? { ...row, role: row.role ?? '' } : null;
  }

  async create(
    username: string,
    hashedPassword: string,
  ): Promise<{ id: number; username: string }> {
    const db = getKysely();

    // Prefer the role named 'user'; fall back to the highest role id (the
    // least privileged by convention) so registration works on databases
    // whose role names differ.
    const named = await db
      .selectFrom('roles')
      .select('id')
      .where(sql<boolean>`name = 'user' COLLATE NOCASE`)
      .limit(1)
      .executeTakeFirst();
    const role =
      named ?? (await db.selectFrom('roles').select('id').orderBy('id', 'desc').executeTakeFirst());
    if (!role) {
      throw new Error(
        'Cannot register: no roles found in the database. Run the schema seed first.',
      );
    }

    const result = await db
      .insertInto('users')
      .values({ username, password: hashedPassword, role_id: role.id })
      .executeTakeFirstOrThrow();
    return { id: Number(result.insertId), username };
  }

  async update(userId: number, fields: Partial<Record<string, unknown>>): Promise<boolean> {
    const changes: { username?: string; password?: string } = {};
    if (typeof fields['username'] === 'string') changes.username = fields['username'];
    if (typeof fields['password'] === 'string') changes.password = fields['password'];
    if (!Object.keys(changes).length) return false;

    const result = await getKysely()
      .updateTable('users')
      .set(changes)
      .where('id', '=', userId)
      .where(notGuest)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async delete(userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('users')
      .where('id', '=', userId)
      .where(notGuest)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
