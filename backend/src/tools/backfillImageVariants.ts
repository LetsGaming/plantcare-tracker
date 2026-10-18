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
import {
  createVariantsFromFile,
  variantFilename,
} from '../modules/images/infrastructure/LocalImageStorage';

const log = createModuleLogger('backfillImageVariants');

const DEFAULT_BATCH_SIZE = 50;
const VARIANTS_PENDING = 0;
const VARIANTS_PRESENT = 1;
const VARIANTS_NONE = -1;
const VARIANT_WIDTHS = [160, 480];

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

const ENTITY_TYPE_PATTERN = /^[a-z_]+$/;
const MAX_BATCH_SIZE = 1000;
const USAGE = 'Usage: images:backfill [--dry-run] [--batch <1-1000>]';

/** Only a definitely absent file counts as missing; other errors are transient and rethrown. */
const exists = async (file: string): Promise<boolean> => {
  try {
    await fs.access(file);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return false;
    throw err;
  }
};

const removeQuietly = (file: string): Promise<void> => fs.rm(file, { force: true });

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

      if (!ENTITY_TYPE_PATTERN.test(row.entity_type)) {
        log.warn('Unexpected entity type', { id: row.id, entityType: row.entity_type });
        result.failed += 1;
      } else if (!/\.webp$/i.test(filename)) {
        log.info('Skipping non-webp image', { id: row.id, filename });
        result.nonWebp += 1;
        await markUnavailable(row.id);
      } else {
        try {
          const mainPath = path.join(rootDir, row.entity_type, filename);
          if (!(await exists(mainPath))) {
            log.warn('Source file missing', { id: row.id, filename });
            result.missing += 1;
            await markUnavailable(row.id);
          } else if (dryRun) {
            result.processed += 1;
          } else {
            const meta = await createVariantsFromFile(row.entity_type, filename, { rootDir });
            const update = await db
              .updateTable('images')
              .set({ ...meta, variants: VARIANTS_PRESENT })
              .where('id', '=', row.id)
              .executeTakeFirst();
            if (Number(update.numUpdatedRows) === 0) {
              await Promise.all(
                VARIANT_WIDTHS.map((width) => removeQuietly(variantFilename(mainPath, width))),
              );
            } else {
              result.processed += 1;
            }
          }
        } catch (err) {
          log.warn('Image backfill failed for row', { id: row.id, reason: (err as Error).message });
          result.failed += 1;
        }
      }
      await yieldToEventLoop();
    }
  }
  return result;
};

export const parseArgs = (argv: string[]): { dryRun: boolean; batchSize: number } => {
  let dryRun = false;
  let batchSize = DEFAULT_BATCH_SIZE;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--batch') {
      const raw = argv[i + 1];
      i += 1;
      const value = raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
        throw new Error(`--batch needs an integer from 1 to ${MAX_BATCH_SIZE}\n${USAGE}`);
      }
      batchSize = value;
    } else {
      throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
    }
  }
  return { dryRun, batchSize };
};

const main = async (): Promise<void> => {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  const { dryRun, batchSize } = parseArgs(process.argv.slice(2));

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
