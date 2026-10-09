import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PendingSnapshot, SnapshotStore } from '../domain/Recognition';

const DEFAULT_TTL_MS = 10 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
const DIR_PREFIX = 'plantcare-snapshots-';
const OWNER_ONLY = 0o600;

export class TempSnapshotStore implements SnapshotStore {
  private readonly items = new Map<string, PendingSnapshot>();
  private sweeper?: NodeJS.Timeout;
  private dir?: string;

  constructor(
    private readonly parentDir: string,
    private readonly ttlMs = DEFAULT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Creates a private (owner-only) directory with an unguessable name. */
  async init(): Promise<void> {
    this.dir = await mkdtemp(path.join(this.parentDir, DIR_PREFIX));
    this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweeper.unref();
  }

  async put(userId: number, webp: Buffer, vector: Float32Array): Promise<string> {
    if (!this.dir) throw new Error('TempSnapshotStore is not initialised');
    const id = randomUUID();
    const file = path.join(this.dir, `${id}.webp`);
    await writeFile(file, webp, { mode: OWNER_ONLY, flag: 'wx' });
    this.items.set(id, { userId, path: file, vector, expiresAt: this.now() + this.ttlMs });
    return id;
  }

  peekPath(id: string): string | undefined {
    return this.items.get(id)?.path;
  }

  take(id: string, userId: number): PendingSnapshot | null {
    const snap = this.items.get(id);
    if (!snap || snap.userId !== userId || snap.expiresAt <= this.now()) return null;
    this.items.delete(id);
    return snap;
  }

  async sweep(): Promise<void> {
    const now = this.now();
    for (const [id, snap] of this.items) {
      if (snap.expiresAt > now) continue;
      this.items.delete(id);
      await rm(snap.path, { force: true });
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.sweeper);
    this.items.clear();
    if (this.dir) await rm(this.dir, { recursive: true, force: true });
    this.dir = undefined;
  }
}
