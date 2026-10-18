import fs from 'fs/promises';
import path from 'path';
import { getUploadsDirectory } from '../../../core/config';
import { createModuleLogger } from '../../../core/logging';
import { IMAGE_ENTITY_TYPES } from '../domain/Image';

const log = createModuleLogger('OrphanUploadSweep');

const DAY_MS = 24 * 60 * 60 * 1000;
const VARIANT_WIDTHS = [160, 480];
const IMAGE_FILE = /\.webp$/i;
const MAX_REMOVAL_RATIO = 0.5;
const MIN_FILES_FOR_RATIO_BRAKE = 20;

export interface OrphanSweepOptions {
  uploadsDir?: string;
  minAgeMs?: number;
  now?: number;
  /** Every stored image url; files they reference are kept. */
  referencedUrls: () => Iterable<string>;
}

export interface OrphanSweepResult {
  scanned: number;
  removed: number;
  /** Set when a safety brake stopped the sweep before anything was deleted. */
  aborted?: 'no-references' | 'too-many-orphans';
}

/**
 * Maps a stored url to `<entity>/<file>`, the layout the image storage writes.
 * Prefixed (`/uploads/plant/x.webp`, absolute) and bare (`plant/x.webp`) urls
 * resolve identically; anything else cannot be tied to a file and is ignored.
 */
const toEntityKey = (url: string): string | null => {
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  const segments = pathname.split('/').filter((segment) => segment.length > 0);
  if (segments.length < 2) return null;
  const [entity, file] = segments.slice(-2);
  if (!(IMAGE_ENTITY_TYPES as readonly string[]).includes(entity) || file === '..') return null;
  return `${entity}/${file}`;
};

const withVariant = (key: string, width: number): string =>
  key.replace(/\.webp$/i, `-${width}.webp`);

/** Every file an image row can own: the stored file and its resized variants. */
const referencedKeys = (urls: Iterable<string>): Set<string> => {
  const keys = new Set<string>();
  for (const url of urls) {
    const key = toEntityKey(url);
    if (!key) continue;
    keys.add(key);
    for (const width of VARIANT_WIDTHS) keys.add(withVariant(key, width));
  }
  return keys;
};

const listEntityImages = async (root: string, entity: string): Promise<string[]> => {
  const dir = path.join(root, entity);
  try {
    const stat = await fs.lstat(dir);
    if (!stat.isDirectory()) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && IMAGE_FILE.test(entry.name))
      .map((entry) => path.join(dir, entry.name));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
};

/**
 * Deletes webp upload files that no image row references and that are older
 * than `minAgeMs`, so a file written just before its row is inserted survives.
 * Only regular files directly inside the known entity folders are considered.
 * The sweep aborts without deleting when no image row exists although files do,
 * or when it would remove most of what it found (wrong database or wrong folder).
 */
export const sweepOrphanUploads = async (
  options: OrphanSweepOptions,
): Promise<OrphanSweepResult> => {
  const root = path.resolve(options.uploadsDir ?? getUploadsDirectory());
  const cutoff = (options.now ?? Date.now()) - (options.minAgeMs ?? DAY_MS);
  const keep = referencedKeys(options.referencedUrls());

  const files: string[] = [];
  for (const entity of IMAGE_ENTITY_TYPES) files.push(...(await listEntityImages(root, entity)));
  const scanned = files.length;

  if (scanned > 0 && keep.size === 0) {
    log.warn('Orphan sweep aborted: no image rows reference any file', { scanned });
    return { scanned, removed: 0, aborted: 'no-references' };
  }

  const candidates: string[] = [];
  for (const file of files) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(root + path.sep)) continue;
    const key = path.relative(root, resolved).split(path.sep).join('/');
    if (keep.has(key)) continue;
    const stat = await fs.lstat(resolved).catch(() => null);
    if (!stat?.isFile() || stat.mtimeMs > cutoff) continue;
    candidates.push(resolved);
  }

  if (
    candidates.length > MIN_FILES_FOR_RATIO_BRAKE &&
    candidates.length / scanned > MAX_REMOVAL_RATIO
  ) {
    log.warn('Orphan sweep aborted: too many files would be removed', {
      scanned,
      candidates: candidates.length,
    });
    return { scanned, removed: 0, aborted: 'too-many-orphans' };
  }

  let removed = 0;
  for (const file of candidates) {
    try {
      await fs.unlink(file);
      removed++;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  return { scanned, removed };
};
