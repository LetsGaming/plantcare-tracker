import { describe, expect, it } from 'vitest';
import { mkdtemp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TempSnapshotStore } from '../../../src/modules/recognition/infrastructure/TempSnapshotStore';

const make = async () => {
  let now = 1_000;
  const parent = await mkdtemp(path.join(tmpdir(), 'snap-parent-'));
  const store = new TempSnapshotStore(parent, 600_000, () => now);
  await store.init();
  return {
    parent,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

describe('TempSnapshotStore', () => {
  it('hands a snapshot out once, only to its owner', async () => {
    const { store } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    expect(store.take(id, 2)).toBeNull();
    const snap = store.take(id, 1);
    expect(snap?.vector[0]).toBe(1);
    expect(store.take(id, 1)).toBeNull();
    await store.stop();
  });

  it('expires after the ttl and sweeps the file', async () => {
    const { store, advance } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    const file = store.peekPath(id)!;
    expect(existsSync(file)).toBe(true);
    advance(600_001);
    expect(store.take(id, 1)).toBeNull();
    await store.sweep();
    expect(existsSync(file)).toBe(false);
    await store.stop();
  });

  it('keeps unexpired snapshots through a sweep', async () => {
    const { store, advance } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    const file = store.peekPath(id)!;
    advance(1_000);
    await store.sweep();
    expect(existsSync(file)).toBe(true);
    expect(store.take(id, 1)).not.toBeNull();
    await store.stop();
  });

  it('works in a unique private directory under the given parent', async () => {
    const { parent, store } = await make();
    const other = new TempSnapshotStore(parent);
    await other.init();
    const a = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    const b = await other.put(1, Buffer.from('x'), Float32Array.from([1]));
    const dirA = path.dirname(store.peekPath(a)!);
    const dirB = path.dirname(other.peekPath(b)!);
    expect(path.dirname(dirA)).toBe(parent);
    expect(path.basename(dirA)).toMatch(/^plantcare-snapshots-/);
    expect(dirA).not.toBe(dirB);
    if (process.platform !== 'win32') {
      expect((await stat(dirA)).mode & 0o077).toBe(0);
      expect((await stat(store.peekPath(a)!)).mode & 0o077).toBe(0);
    }
    await store.stop();
    await other.stop();
  });

  it('removes its whole directory on stop', async () => {
    const { store } = await make();
    const id = await store.put(1, Buffer.from('x'), Float32Array.from([1]));
    const file = store.peekPath(id)!;
    const dir = path.dirname(file);
    await store.stop();
    expect(existsSync(file)).toBe(false);
    expect(existsSync(dir)).toBe(false);
    expect(store.take(id, 1)).toBeNull();
  });
});
