/**
 * modules/auth/infrastructure/MySQLUserRepository.ts
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { UserRepository, UserData } from '../domain/User';

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password: string;
  role: string;
}

export class MySQLUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async findByUsername(username: string): Promise<UserData | null> {
    const [rows] = await this.pool.query<UserRow[]>(
      `SELECT users.id, username, password, roles.name AS role
       FROM users LEFT JOIN roles ON users.role_id = roles.id
       WHERE username = ?`,
      [username],
    );
    return rows[0] ?? null;
  }

  async create(username: string, hashedPassword: string): Promise<{ id: number; username: string }> {
    const [result] = await this.pool.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword],
    );
    return { id: (result as { insertId: number }).insertId, username };
  }

  async update(userId: number, fields: Partial<Record<string, unknown>>): Promise<boolean> {
    const ALLOWED_COLUMNS = new Set(['username', 'password']);
    const keys = Object.keys(fields).filter(
      (k) => k !== 'passwordConfirmation' && ALLOWED_COLUMNS.has(k),
    );
    if (!keys.length) return false;
    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = [...keys.map((k) => fields[k]), userId];
    const [result] = await this.pool.execute(
      `UPDATE users SET ${setClause} WHERE id = ?`,
      values as (string | number | boolean | null)[],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async delete(userId: number): Promise<boolean> {
    const [result] = await this.pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    return (result as { affectedRows: number }).affectedRows > 0;
  }
}
