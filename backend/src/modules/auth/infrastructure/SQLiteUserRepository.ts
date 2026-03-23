/**
 * modules/auth/infrastructure/SQLiteUserRepository.ts
 */

import { query, execute } from '../../../core/database/db';
import type { UserRepository, UserData } from '../domain/User';

interface UserRow {
  id: number;
  username: string;
  password: string;
  role: string;
}

export class SQLiteUserRepository implements UserRepository {
  async findByUsername(username: string): Promise<UserData | null> {
    const rows = query<UserRow>(
      `SELECT users.id, username, password, roles.name AS role
       FROM users LEFT JOIN roles ON users.role_id = roles.id
       WHERE username = ?`,
      [username],
    );
    return rows[0] ?? null;
  }

  async create(username: string, hashedPassword: string): Promise<{ id: number; username: string }> {
    const result = execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
    );
    return { id: result.insertId, username };
  }

  async update(userId: number, fields: Partial<Record<string, unknown>>): Promise<boolean> {
    const ALLOWED_COLUMNS = new Set(['username', 'password']);
    const keys = Object.keys(fields).filter(
      (k) => k !== 'passwordConfirmation' && ALLOWED_COLUMNS.has(k),
    );
    if (!keys.length) return false;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = [...keys.map((k) => fields[k] as string | number | boolean | null), userId];
    const result = execute(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      values,
    );
    return result.affectedRows > 0;
  }

  async delete(userId: number): Promise<boolean> {
    const result = execute('DELETE FROM users WHERE id = ?', [userId]);
    return result.affectedRows > 0;
  }
}
