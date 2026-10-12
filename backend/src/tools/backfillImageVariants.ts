/**
 * Usage: pnpm run images:backfill -- [--dry-run] [--batch 50]
 *
 * Creates the 160 and 480 px variants for images stored before variants
 * existed. Rows are selected by `variants = 0`; a row is only updated after
 * its files are written, so an interrupted run can simply be started again.
 * Rows whose file is missing or is not a webp get `variants = -1` and are
 * left alone from then on.
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { getKysely, initDatabase, closeDb } from '../core/database/db';
import { createModuleLogger } from '../core/logging';
import { getUploadsDirectory } from '../core/config';
import { createVariantsFromFile } from '../modules/images/infrastructure/LocalImageStorage';

const log = createModuleLogger('backfillImageVariants');

const DEFAULT_BATCH_SIZE = 50;
const VARIANTS_PENDING = 0;
const VARIANTS_PRESENT = 1;
const VARIANTS_NONE = -1;

export interface BackfillOptions {
  batchSize?: number;
  dryRun?: boolean;
  /** Stops after this many images were examined; for resumable partial runs. */
  limit?: number;
  signal?: AbortSignal;
  uploadsDir?: string;
}

export interface BackfillResult {
  /** Images that got (or, in a dry run, would get) variants. */
  processed: number;
  missing: number;
  nonWebp: number;
  failed: number;
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const exists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

export const runVariantBackfill = async (
  options: BackfillOptions = {},
): Promise<BackfillResult> => {
  const { batchSize = DEFAULT_BATCH_SIZE, dryRun = false, limit, signal } = options;
  const rootDir = options.uploadsDir ?? getUploadsDirectory();
  const db = getKysely();
  const result: BackfillResult = { processed: 0, missing: 0, nonWebp: 0, failed: 0 };
  let examined = 0;
  let lastId = 0;

  const markUnavailable = async (id: number): Promise<void> => {
    if (!dryRun) {
      await db
        .updateTable('images')
        .set({ variants: VARIANTS_NONE })
        .where('id', '=', id)
        .execute();
    }
  };

  while (!signal?.aborted && (limit === undefined || examined < limit)) {
    const rows = await db
      .selectFrom('images')
      .select(['id', 'image_url', 'entity_type'])
      .where('variants', '=', VARIANTS_PENDING)
      .where('id', '>', lastId)
      .orderBy('id')
      .limit(batchSize)
      .execute();
    if (!rows.length) break;

    for (const row of rows) {
      if (signal?.aborted || (limit !== undefined && examined >= limit)) return result;
      examined += 1;
      lastId = row.id;
      const filename = path.basename(row.image_url);

      if (!/\.webp$/i.test(filename)) {
        log.info('Skipping non-webp image', { id: row.id, filename });
        result.nonWebp += 1;
        await markUnavailable(row.id);
      } else if (!(await exists(path.join(rootDir, row.entity_type, filename)))) {
        log.warn('Source file missing', { id: row.id, filename });
        result.missing += 1;
        await markUnavailable(row.id);
      } else if (dryRun) {
        result.processed += 1;
      } else {
        try {
          const meta = await createVariantsFromFile(row.entity_type, filename, { rootDir });
          await db
            .updateTable('images')
            .set({ ...meta, variants: VARIANTS_PRESENT })
            .where('id', '=', row.id)
            .execute();
          result.processed += 1;
        } catch (err) {
          log.warn('Variant creation failed', { id: row.id, reason: (err as Error).message });
          result.failed += 1;
        }
      }
      await yieldToEventLoop();
    }
  }
  return result;
};

const parseBatchSize = (argv: string[]): number => {
  const index = argv.indexOf('--batch');
  if (index === -1) return DEFAULT_BATCH_SIZE;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('--batch needs a positive integer');
  }
  return value;
};

const main = async (): Promise<void> => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const batchSize = parseBatchSize(argv);

  await initDatabase();
  try {
    const result = await runVariantBackfill({ batchSize, dryRun });
    const verb = dryRun ? 'would process' : 'processed';
    console.log(
      `${verb} ${result.processed}, missing ${result.missing}, non-webp ${result.nonWebp}, failed ${result.failed}`,
    );
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await closeDb();
  }
};

if (typeof module !== 'undefined' && require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
