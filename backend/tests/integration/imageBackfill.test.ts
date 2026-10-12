/**
 * The image variant backfill against an in-memory database and a temporary
 * uploads directory.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';

process.env.DB_PATH = ':memory:';

import { initDatabase, closeDb, getSqlite } from '../../src/core/database/db';
import { runVariantBackfill, parseArgs } from '../../src/tools/backfillImageVariants';
import { variantFilename } from '../../src/modules/images/infrastructure/LocalImageStorage';

interface Row {
  id: number;
  variants: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
}

let uploadsDir: string;
let seq = 0;

const rows = (): Row[] =>
  getSqlite()
    .prepare('SELECT id, variants, width, height, placeholder FROM images ORDER BY id')
    .all() as Row[];

const dirOf = () => path.join(uploadsDir, 'plant');

const addImage = async (
  name: string,
  options: { width?: number; ext?: string; missing?: boolean } = {},
): Promise<{ id: number; file: string }> => {
  const { width = 1024, ext = 'webp', missing = false } = options;
  const filename = `${++seq}-${name}.${ext}`;
  const file = path.join(dirOf(), filename);
  if (!missing) {
    const image = sharp({
      create: { width, height: Math.round(width * 0.75), channels: 3, background: '#3a7d44' },
    });
    await (ext === 'webp' ? image.webp() : image.jpeg()).toFile(file);
  }
  const result = getSqlite()
    .prepare("INSERT INTO images (image_url, entity_type, entity_id) VALUES (?, 'plant', 1)")
    .run(`/uploads/plant/${filename}`);
  return { id: Number(result.lastInsertRowid), file };
};

const listFiles = async (): Promise<string[]> => (await fs.readdir(dirOf())).sort();
const widthOf = async (file: string): Promise<number> => (await sharp(file).metadata()).width ?? 0;

beforeAll(async () => {
  await initDatabase();
});

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  getSqlite().prepare('DELETE FROM images').run();
  uploadsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backfill-'));
  await fs.mkdir(dirOf(), { recursive: true });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(uploadsDir, { recursive: true, force: true, maxRetries: 3 });
});

describe('runVariantBackfill', () => {
  it('creates both variants and stores width, height and placeholder', async () => {
    const big = await addImage('big');
    const small = await addImage('small', { width: 100 });

    const result = await runVariantBackfill({ uploadsDir });

    expect(result).toEqual({ processed: 2, missing: 0, nonWebp: 0, failed: 0 });
    expect(await widthOf(variantFilename(big.file, 160))).toBe(160);
    expect(await widthOf(variantFilename(big.file, 480))).toBe(480);
    expect(await widthOf(variantFilename(small.file, 160))).toBe(100);
    expect(await widthOf(variantFilename(small.file, 480))).toBe(100);
    const [bigRow, smallRow] = rows();
    expect(bigRow).toMatchObject({ variants: 1, width: 1024, height: 768 });
    expect(bigRow?.placeholder).toMatch(/^#[0-9a-f]{6}$/);
    expect(smallRow).toMatchObject({ variants: 1, width: 100, height: 75 });
  });

  it('leaves the stored main file byte-identical', async () => {
    const image = await addImage('main');
    const before = await fs.readFile(image.file);

    await runVariantBackfill({ uploadsDir });

    expect((await fs.readFile(image.file)).equals(before)).toBe(true);
  });

  it('is idempotent', async () => {
    await addImage('a');
    await addImage('b');
    await runVariantBackfill({ uploadsDir });
    const rowsAfterFirst = rows();
    const filesAfterFirst = await listFiles();

    const second = await runVariantBackfill({ uploadsDir });

    expect(second).toEqual({ processed: 0, missing: 0, nonWebp: 0, failed: 0 });
    expect(rows()).toEqual(rowsAfterFirst);
    expect(await listFiles()).toEqual(filesAfterFirst);
  });

  it('resumes after an interruption', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await addImage(name);

    const first = await runVariantBackfill({ uploadsDir, batchSize: 2, limit: 3 });
    expect(first.processed).toBe(3);
    expect(rows().map((r) => r.variants)).toEqual([1, 1, 1, 0, 0]);

    const second = await runVariantBackfill({ uploadsDir, batchSize: 2 });
    expect(second.processed).toBe(2);
    expect(rows().map((r) => r.variants)).toEqual([1, 1, 1, 1, 1]);
  });

  it('overwrites variant files left behind by an interrupted run', async () => {
    const image = await addImage('half');
    await fs.writeFile(variantFilename(image.file, 160), 'partial');

    await runVariantBackfill({ uploadsDir });

    expect(await widthOf(variantFilename(image.file, 160))).toBe(160);
    expect(rows()[0]?.variants).toBe(1);
  });

  it('does not change rows or files in a dry run', async () => {
    await addImage('a');
    await addImage('gone', { missing: true });
    await addImage('legacy', { ext: 'jpg' });
    const rowsBefore = rows();
    const filesBefore = await listFiles();

    const result = await runVariantBackfill({ uploadsDir, dryRun: true });

    expect(result).toEqual({ processed: 1, missing: 1, nonWebp: 1, failed: 0 });
    expect(rows()).toEqual(rowsBefore);
    expect(await listFiles()).toEqual(filesBefore);
  });

  it('marks rows with a missing source file as variants -1', async () => {
    const gone = await addImage('gone', { missing: true });
    const ok = await addImage('ok');

    const result = await runVariantBackfill({ uploadsDir });

    expect(result.missing).toBe(1);
    expect(rows().find((r) => r.id === gone.id)).toMatchObject({ variants: -1, width: null });
    expect(rows().find((r) => r.id === ok.id)?.variants).toBe(1);
  });

  it('marks non-webp files as variants -1 and creates no variants for them', async () => {
    const legacy = await addImage('legacy', { ext: 'jpg' });

    const result = await runVariantBackfill({ uploadsDir });

    expect(result.nonWebp).toBe(1);
    expect(rows()[0]?.variants).toBe(-1);
    expect(await listFiles()).toEqual([path.basename(legacy.file)]);
  });

  it('keeps a row pending when its file cannot be decoded and continues', async () => {
    const broken = await addImage('broken');
    await fs.writeFile(broken.file, 'not a webp');
    const ok = await addImage('ok');

    const result = await runVariantBackfill({ uploadsDir });

    expect(result).toMatchObject({ processed: 1, failed: 1 });
    expect(rows().find((r) => r.id === broken.id)?.variants).toBe(0);
    expect(rows().find((r) => r.id === ok.id)?.variants).toBe(1);
  });

  it('stops when the signal is aborted', async () => {
    await addImage('a');
    const controller = new AbortController();
    controller.abort();

    const result = await runVariantBackfill({ uploadsDir, signal: controller.signal });

    expect(result.processed).toBe(0);
    expect(rows()[0]?.variants).toBe(0);
  });

  it('stops after the current row when aborted mid-run', async () => {
    for (const name of ['a', 'b', 'c']) await addImage(name);
    const controller = new AbortController();
    const realAccess = fs.access.bind(fs);
    vi.spyOn(fs, 'access').mockImplementation(async (file, mode) => {
      controller.abort();
      return realAccess(file, mode);
    });

    const result = await runVariantBackfill({ uploadsDir, signal: controller.signal });

    expect(result.processed).toBe(1);
    expect(rows().map((r) => r.variants)).toEqual([1, 0, 0]);
  });

  it.each(['EACCES', 'EMFILE', 'EBUSY'])(
    'keeps a row pending and counts it failed on a transient %s error',
    async (code) => {
      await addImage('a');
      vi.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error(code), { code }));

      const result = await runVariantBackfill({ uploadsDir });

      expect(result).toEqual({ processed: 0, missing: 0, nonWebp: 0, failed: 1 });
      expect(rows()[0]?.variants).toBe(0);
    },
  );

  it.each(['ENOENT', 'ENOTDIR'])('marks a row as variants -1 on %s', async (code) => {
    await addImage('a');
    vi.spyOn(fs, 'access').mockRejectedValue(Object.assign(new Error(code), { code }));

    const result = await runVariantBackfill({ uploadsDir });

    expect(result.missing).toBe(1);
    expect(rows()[0]?.variants).toBe(-1);
  });

  it('counts a row with an unexpected entity type as failed and leaves it pending', async () => {
    getSqlite().pragma('ignore_check_constraints = ON');
    getSqlite()
      .prepare("INSERT INTO images (image_url, entity_type, entity_id) VALUES (?, '../x', 1)")
      .run('/uploads/plant/a.webp');
    getSqlite().pragma('ignore_check_constraints = OFF');

    const result = await runVariantBackfill({ uploadsDir });

    expect(result).toEqual({ processed: 0, missing: 0, nonWebp: 0, failed: 1 });
    expect(rows()[0]?.variants).toBe(0);
  });

  it('removes the written variant files when the row vanished during the pass', async () => {
    const image = await addImage('gone');
    const realAccess = fs.access.bind(fs);
    vi.spyOn(fs, 'access').mockImplementation(async (file, mode) => {
      getSqlite().prepare('DELETE FROM images').run();
      return realAccess(file, mode);
    });

    const result = await runVariantBackfill({ uploadsDir });

    expect(result.processed).toBe(0);
    expect(await listFiles()).toEqual([path.basename(image.file)]);
  });
});

describe('parseArgs', () => {
  it('accepts the documented flags', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, batchSize: 50 });
    expect(parseArgs(['--dry-run', '--batch', '1000'])).toEqual({ dryRun: true, batchSize: 1000 });
  });

  it.each([['--dryrun'], ['--batch'], ['--batch', '0'], ['--batch', '1001'], ['--batch', '2.5']])(
    'rejects %s',
    (...argv) => {
      expect(() => parseArgs(argv)).toThrow(/Usage/);
    },
  );
});
