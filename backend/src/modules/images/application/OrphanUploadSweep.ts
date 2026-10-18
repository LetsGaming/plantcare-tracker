import fs from 'fs/promises';
import path from 'path';
import { getSqlite } from '../../../core/database/db';
import { getUploadsDirectory, STATIC_UPLOADS_ROUTE } from '../../../core/config';
import { variantUrl } from '../../../core/config/uploads';

const DAY_MS = 24 * 60 * 60 * 1000;
const VARIANT_WIDTHS = [160, 480];

export interface OrphanSweepOptions {
  uploadsDir?: string;
  minAgeMs?: number;
  now?: number;
  /** Stored image urls; defaults to every row of the images table. */
  referencedUrls?: () => Iterable<string>;
}

export interface OrphanSweepResult {
  scanned: number;
  removed: number;
}

const allImageUrls = (): Iterable<string> =>
  getSqlite().prepare<[], string>('SELECT image_url FROM images').pluck().iterate();

const toRelativeKey = (url: string): string | null => {
  const prefix = `${STATIC_UPLOADS_ROUTE}/`;
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length) : null;
};

/** Every file an image row can own: the stored file and its resized variants. */
const referencedKeys = (urls: Iterable<string>): Set<string> => {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = toRelativeKey(url);
    if (!key) continue;
    keys.add(key);
    for (const width of VARIANT_WIDTHS) keys.add(variantUrl(key, width));
  }
  return keys;
};

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

/**
 * Deletes upload files that no image row references and that are older than
 * `minAgeMs`, so a file written just before its row is inserted survives.
 * Only regular files below the uploads directory are ever touched.
 */
export const sweepOrphanUploads = async (
  options: OrphanSweepOptions = {},
): Promise<OrphanSweepResult> => {
  const root = path.resolve(options.uploadsDir ?? getUploadsDirectory());
  const cutoff = (options.now ?? Date.now()) - (options.minAgeMs ?? DAY_MS);
  const keep = referencedKeys((options.referencedUrls ?? allImageUrls)());

  let scanned = 0;
  let removed = 0;
  try {
    for await (const file of walk(root)) {
      const resolved = path.resolve(file);
      if (!resolved.startsWith(root + path.sep)) continue;
      scanned++;
      const key = path.relative(root, resolved).split(path.sep).join('/');
      if (keep.has(key)) continue;
      const stat = await fs.lstat(resolved);
      if (!stat.isFile() || stat.mtimeMs > cutoff) continue;
      await fs.unlink(resolved);
      removed++;
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  return { scanned, removed };
};
