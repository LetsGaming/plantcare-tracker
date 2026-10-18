import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const moduleLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    moduleLog,
    logger: { log: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    pragma: vi.fn(),
    sweepSessions: vi.fn(() => 0),
    sweepTickets: vi.fn(() => 0),
  };
});

vi.mock('../../../src/core/logging/logger', () => ({
  logger: mocks.logger,
  createModuleLogger: () => mocks.moduleLog,
  requestContext: { getStore: () => undefined },
}));
vi.mock('../../../src/core/database/db', () => ({
  getSqlite: () => ({ pragma: mocks.pragma }),
}));
vi.mock('../../../src/core/auth/sessions', () => ({
  sweepSessions: mocks.sweepSessions,
  sweepTickets: mocks.sweepTickets,
}));

import {
  MaintenanceScheduler,
  createDefaultMaintenanceJobs,
} from '../../../src/core/maintenance/MaintenanceScheduler';
import { sweepOrphanUploads } from '../../../src/modules/images/application/OrphanUploadSweep';
import { globalErrorHandler } from '../../../src/core/middleware/errorHandler';
import { NotFoundError, UnauthorizedError, ValidationError } from '../../../src/core/errors';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('MaintenanceScheduler', () => {
  const pruneSales = vi.fn();
  const sweepUploads = vi.fn();
  let scheduler: MaintenanceScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    scheduler = new MaintenanceScheduler(
      createDefaultMaintenanceJobs({ pruneSales, sweepUploads }),
    );
    scheduler.start();
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.useRealTimers();
  });

  it('sweeps tickets every 5 minutes', async () => {
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(mocks.sweepTickets).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(mocks.sweepTickets).toHaveBeenCalledTimes(2);
  });

  it('sweeps expired sessions hourly', async () => {
    await vi.advanceTimersByTimeAsync(HOUR - 1);
    expect(mocks.sweepSessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.sweepSessions).toHaveBeenCalledTimes(1);
  });

  it('prunes sales retention and orphan uploads daily', async () => {
    await vi.advanceTimersByTimeAsync(DAY - 1);
    expect(pruneSales).not.toHaveBeenCalled();
    expect(sweepUploads).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(pruneSales).toHaveBeenCalledTimes(1);
    expect(sweepUploads).toHaveBeenCalledTimes(1);
  });

  it('optimizes every 6 hours and checkpoints the WAL every 10 minutes', async () => {
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(mocks.pragma).toHaveBeenCalledWith('wal_checkpoint(PASSIVE)');
    expect(mocks.pragma).not.toHaveBeenCalledWith('optimize');
    await vi.advanceTimersByTimeAsync(6 * HOUR);
    expect(mocks.pragma).toHaveBeenCalledWith('optimize');
  });

  it('logs a failing job and keeps running the others', async () => {
    mocks.sweepTickets.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await vi.advanceTimersByTimeAsync(10 * MINUTE);
    expect(mocks.moduleLog.error).toHaveBeenCalledWith(
      'Job ticket-sweep failed',
      expect.objectContaining({ err: expect.any(Error) }),
    );
    expect(mocks.sweepTickets).toHaveBeenCalledTimes(2);
    expect(mocks.pragma).toHaveBeenCalledWith('wal_checkpoint(PASSIVE)');
  });

  it('does not start a job again while it is still running', async () => {
    let release!: () => void;
    const slow = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const own = new MaintenanceScheduler([{ name: 'slow', intervalMs: MINUTE, run: slow }]);
    own.start();
    await vi.advanceTimersByTimeAsync(3 * MINUTE);
    expect(slow).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(slow).toHaveBeenCalledTimes(2);
    void own.stop();
  });

  it('stop waits for a running job but gives up after the timeout', async () => {
    let release!: () => void;
    const slow = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const own = new MaintenanceScheduler([{ name: 'slow', intervalMs: MINUTE, run: slow }]);
    own.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    let stopped = false;
    const stopping = own.stop(1000).then(() => (stopped = true));
    await vi.advanceTimersByTimeAsync(500);
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);

    const stuck = new MaintenanceScheduler([
      { name: 'stuck', intervalMs: MINUTE, run: () => new Promise<void>(() => undefined) },
    ]);
    stuck.start();
    await vi.advanceTimersByTimeAsync(MINUTE);
    const giveUp = stuck.stop(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(giveUp).resolves.toBeUndefined();
  });

  it('uses unref timers and stop clears every one of them', async () => {
    expect(vi.getTimerCount()).toBe(6);
    await scheduler.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2 * DAY);
    expect(mocks.sweepTickets).not.toHaveBeenCalled();
    expect(pruneSales).not.toHaveBeenCalled();
  });

  it('unrefs its timers so they never hold the process open', () => {
    const unref = vi.fn();
    const spy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((() => ({ unref, [Symbol.toPrimitive]: () => 1 })) as never);
    const own = new MaintenanceScheduler([{ name: 'a', intervalMs: MINUTE, run: () => 0 }]);
    own.start();
    expect(unref).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('sweepOrphanUploads', () => {
  let dir: string;
  const now = Date.now();
  const old = new Date(now - 3 * DAY);

  const put = async (relative: string, mtime: Date): Promise<string> => {
    const file = path.join(dir, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, 'x');
    await fs.utimes(file, mtime, mtime);
    return file;
  };
  const exists = (relative: string): Promise<boolean> =>
    fs.stat(path.join(dir, relative)).then(
      () => true,
      () => false,
    );

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orphan-sweep-'));
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  it('keeps referenced files with their variants and recent files, removes the rest', async () => {
    await put('plant/a-1.webp', old);
    await put('plant/a-1-160.webp', old);
    await put('plant/a-1-480.webp', old);
    await put('plant/legacy.jpg', old);
    await put('plant/orphan-2.webp', old);
    await put('plant/orphan-2-160.webp', old);
    await put('substrate/fresh.webp', new Date(now - 60 * MINUTE));

    const result = await sweepOrphanUploads({
      uploadsDir: dir,
      now,
      referencedUrls: () => [
        '/uploads/plant/a-1.webp',
        'https://api.example.com/uploads/plant/legacy.jpg',
      ],
    });

    expect(result).toEqual({ scanned: 6, removed: 2 });
    expect(await exists('plant/a-1.webp')).toBe(true);
    expect(await exists('plant/a-1-160.webp')).toBe(true);
    expect(await exists('plant/a-1-480.webp')).toBe(true);
    expect(await exists('plant/legacy.jpg')).toBe(true);
    expect(await exists('substrate/fresh.webp')).toBe(true);
    expect(await exists('plant/orphan-2.webp')).toBe(false);
    expect(await exists('plant/orphan-2-160.webp')).toBe(false);
  });

  it('never touches files outside the uploads directory', async () => {
    const outside = path.join(os.tmpdir(), `orphan-outside-${now}.txt`);
    await fs.writeFile(outside, 'keep');
    await fs.utimes(outside, old, old);
    await put('plant/orphan.webp', old);

    await sweepOrphanUploads({
      uploadsDir: dir,
      now,
      referencedUrls: () => [`/uploads/../${path.basename(outside)}`],
    });

    expect(await fs.readFile(outside, 'utf8')).toBe('keep');
    await fs.rm(outside);
  });

  it('only touches webp files inside the entity folders', async () => {
    await put('plant/keep-ref.webp', old);
    await put('plant/notes.txt', old);
    await put('other/stray.webp', old);
    await put('stray-root.webp', old);
    await put('plant/orphan.webp', old);

    const result = await sweepOrphanUploads({
      uploadsDir: dir,
      now,
      referencedUrls: () => ['/uploads/plant/keep-ref.webp'],
    });

    expect(result).toEqual({ scanned: 2, removed: 1 });
    expect(await exists('plant/notes.txt')).toBe(true);
    expect(await exists('other/stray.webp')).toBe(true);
    expect(await exists('stray-root.webp')).toBe(true);
    expect(await exists('plant/orphan.webp')).toBe(false);
  });

  it('treats urls with and without the uploads prefix the same', async () => {
    await put('plant/a.webp', old);
    await put('substrate/b.webp', old);
    await put('component/c.webp', old);
    await put('plant/orphan.webp', old);

    const result = await sweepOrphanUploads({
      uploadsDir: dir,
      now,
      referencedUrls: () => [
        'plant/a.webp',
        '/uploads/substrate/b.webp',
        'http://h/uploads/component/c.webp',
      ],
    });

    expect(result.removed).toBe(1);
    expect(await exists('plant/a.webp')).toBe(true);
    expect(await exists('substrate/b.webp')).toBe(true);
    expect(await exists('component/c.webp')).toBe(true);
  });

  it('aborts without deleting when no image row references anything', async () => {
    await put('plant/a.webp', old);

    const result = await sweepOrphanUploads({ uploadsDir: dir, now, referencedUrls: () => [] });

    expect(result).toEqual({ scanned: 1, removed: 0, aborted: 'no-references' });
    expect(await exists('plant/a.webp')).toBe(true);
    expect(mocks.moduleLog.warn).toHaveBeenCalled();
  });

  it('aborts when most files would be removed', async () => {
    await put('plant/ref.webp', old);
    for (let i = 0; i < 25; i++) await put(`plant/orphan-${i}.webp`, old);

    const result = await sweepOrphanUploads({
      uploadsDir: dir,
      now,
      referencedUrls: () => ['/uploads/plant/ref.webp'],
    });

    expect(result).toEqual({ scanned: 26, removed: 0, aborted: 'too-many-orphans' });
    expect(await exists('plant/orphan-0.webp')).toBe(true);
  });

  it('removes a few orphans among many referenced files', async () => {
    const urls: string[] = [];
    for (let i = 0; i < 30; i++) {
      await put(`plant/ref-${i}.webp`, old);
      urls.push(`/uploads/plant/ref-${i}.webp`);
    }
    await put('plant/orphan.webp', old);

    const result = await sweepOrphanUploads({ uploadsDir: dir, now, referencedUrls: () => urls });

    expect(result).toEqual({ scanned: 31, removed: 1 });
  });

  it('returns zero when the uploads directory does not exist yet', async () => {
    const result = await sweepOrphanUploads({
      uploadsDir: path.join(dir, 'missing'),
      now,
      referencedUrls: () => [],
    });
    expect(result).toEqual({ scanned: 0, removed: 0 });
  });
});

describe('globalErrorHandler 4xx log levels', () => {
  const reply = () => {
    const r = { sent: false, code: vi.fn(), send: vi.fn() };
    r.code.mockReturnValue(r);
    return r;
  };
  const request = { method: 'GET', url: '/x?y=1' };
  const handle = (err: unknown) => {
    vi.clearAllMocks();
    globalErrorHandler(err, request as never, reply() as never);
  };

  it('logs 401 at debug', () => {
    handle(new UnauthorizedError('expired'));
    expect(mocks.logger.log).toHaveBeenCalledWith('debug', expect.any(String), expect.anything());
  });

  it.each([new ValidationError('bad'), new NotFoundError('gone')])(
    'logs other 4xx at info, never warn or error',
    (err) => {
      handle(err);
      expect(mocks.logger.log).toHaveBeenCalledWith('info', expect.any(String), expect.anything());
      expect(mocks.logger.warn).not.toHaveBeenCalled();
      expect(mocks.logger.error).not.toHaveBeenCalled();
    },
  );

  it('still logs unexpected errors at error', () => {
    handle(new Error('kaput'));
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });
});
