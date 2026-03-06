/**
 * modules/auth/domain/User.ts
 */

export interface UserData {
  id: number;
  username: string;
  password: string;
  role: string;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserData | null>;
  create(username: string, hashedPassword: string): Promise<{ id: number; username: string }>;
  update(userId: number, fields: Partial<Record<string, unknown>>): Promise<boolean>;
  delete(userId: number): Promise<boolean>;
}
