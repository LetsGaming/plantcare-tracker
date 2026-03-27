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
    // Resolve the lowest-privilege role at runtime rather than relying on
    // the column DEFAULT (3). On a fresh database the roles table may not
    // yet contain that row, which would fire a FOREIGN KEY constraint error.
    //
    // Strategy: prefer the role named 'user' (case-insensitive); fall back
    // to the role with the highest id (last inserted = least privileged by
    // convention). Two separate queries avoids the invalid SQLite syntax
    // of placing LIMIT on individual UNION ALL arms.
    let roleRow = query<{ id: number }>(
      `SELECT id FROM roles WHERE name = 'user' COLLATE NOCASE LIMIT 1`,
    );
    if (!roleRow.length) {
      roleRow = query<{ id: number }>(
        `SELECT id FROM roles ORDER BY id DESC LIMIT 1`,
      );
    }

    if (!roleRow.length) {
      // No roles exist at all — the schema seed hasn't run yet.
      throw new Error(
        'Cannot register: no roles found in the database. Run the schema seed first.',
      );
    }

    const roleId = roleRow[0].id;
    const result = execute(
      'INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)',
      [username, hashedPassword, roleId],
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
