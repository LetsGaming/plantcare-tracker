/**
 * modules/auth/domain/User.ts
 */

export interface UserData {
  id: number;
  username: string;
  password: string;
  role: string;
}

/** A stored image file whose row was removed together with its owner's account. */
export interface RemovedImageFile {
  entityType: 'plant' | 'substrate';
  url: string;
}

export interface AccountDeleter {
  /** Returns the removed image files, or null when no deletable user exists. */
  deleteAccount(userId: number): Promise<RemovedImageFile[] | null>;
}

export interface ImageFileRemover {
  removeFiles(images: readonly RemovedImageFile[]): Promise<void>;
}

export interface UserRepository {
  findByUsername(username: string): Promise<UserData | null>;
  create(username: string, hashedPassword: string): Promise<{ id: number; username: string }>;
  update(userId: number, fields: Partial<Record<string, unknown>>): Promise<boolean>;
  /** Replaces the stored hash without touching sessions; used to upgrade legacy hashes. */
  updatePasswordHash(userId: number, hash: string): Promise<void>;
  delete(userId: number): Promise<boolean>;
}
