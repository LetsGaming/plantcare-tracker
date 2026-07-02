/**
 * modules/images/infrastructure/LocalImageStorage.ts
 *
 * Local-disk implementation of the ImageStorage port.
 *
 * Everything filesystem/Sharp/EXIF related that used to sit at the top
 * of imageRoutes.ts lives here now: capture-date extraction, filename
 * anonymisation, webp conversion, resized reads for serving, and
 * deletion. The application layer sees only the port.
 */

import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import ExifParser from 'exif-parser';
import type {
  ImageStorage,
  ProcessedUpload,
  UploadedFile,
  EntityType,
} from '../domain/Image';
import { NotFoundError } from '../../../core/errors';
import { getUploadsDirectory } from '../../../core/config';
import { createModuleLogger } from '../../../core/logging';

const log = createModuleLogger('LocalImageStorage');

// ── Processing constants ──────────────────────────────────────────────────────

/** Stored images are downscaled to at most this width. */
const MAX_STORED_WIDTH = 1024;
/** webp quality for stored files. */
const WEBP_QUALITY = 70;
/** Filename tokens that leak device or account context and are dropped. */
const PII_REDLIST = ['admin', 'user', 'owner', 'desktop', 'download', 'iphone', 'android', 'tmp'];
/** Maximum length of the descriptive part of a generated filename. */
const FILENAME_BASE_MAX_LENGTH = 25;
/** EXIF dates before this year are treated as camera-clock garbage. */
const MIN_PLAUSIBLE_EXIF_YEAR = 1990;
/** Tolerated clock skew for "date in the future" EXIF values. */
const FUTURE_SKEW_TOLERANCE_MS = 60_000;

// ── EXIF date extraction ──────────────────────────────────────────────────────

const parseExifDate = (value: unknown): Date | null => {
  if (!value) return null;
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'number') {
    date = new Date(String(value).length === 10 ? value * 1000 : value);
  } else if (typeof value === 'string') {
    // EXIF uses "YYYY:MM:DD hh:mm:ss" — colons in the date part must
    // become dashes before Date can parse it.
    date = new Date(value.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
  } else {
    return null;
  }
  if (isNaN(date.getTime())) return null;
  if (
    date.getFullYear() < MIN_PLAUSIBLE_EXIF_YEAR ||
    date.getTime() > Date.now() + FUTURE_SKEW_TOLERANCE_MS
  ) {
    return null;
  }
  return date;
};

const extractImageDate = (buffer: Buffer): Date => {
  try {
    const result = ExifParser.create(buffer).parse();
    const tags = result?.tags ?? {};
    for (const key of ['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'GPSDateStamp']) {
      const parsed = parseExifDate(tags[key as keyof typeof tags]);
      if (parsed) return parsed;
    }
  } catch (err) {
    log.warn('EXIF extraction failed', { reason: (err as Error).message });
  }
  return new Date();
};

// ── Filename anonymiser ───────────────────────────────────────────────────────

/**
 * Turns an arbitrary client filename into a short, PII-free base name.
 * Context keywords (e.g. the entity type) survive the redlist filter.
 */
const anonymizeImageName = (fileName: string, contextKeywords: string[] = []): string => {
  if (!fileName) return 'img.jpg';
  const lastDot = fileName.lastIndexOf('.');
  const ext = lastDot !== -1 ? fileName.slice(lastDot).toLowerCase() : '.jpg';
  const namePart = lastDot !== -1 ? fileName.slice(0, lastDot) : fileName;

  const tokens = namePart
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !PII_REDLIST.includes(t) && !/^\d+$/.test(t) || contextKeywords.includes(t));

  const base = tokens.length > 0 ? tokens.join('-') : 'image';
  const hash = Math.random().toString(36).substring(2, 6);
  return `${base.substring(0, FILENAME_BASE_MAX_LENGTH)}-${hash}${ext}`;
};

// ── Adapter ───────────────────────────────────────────────────────────────────

export class LocalImageStorage implements ImageStorage {
  private readonly rootDir: string;

  constructor(rootDir: string = getUploadsDirectory()) {
    this.rootDir = rootDir;
  }

  async processUpload(
    file: UploadedFile,
    entityType: EntityType,
  ): Promise<ProcessedUpload> {
    const uploadPath = path.join(this.rootDir, entityType);
    await fs.mkdir(uploadPath, { recursive: true });

    const baseName = anonymizeImageName(file.originalName, [entityType])
      .replace(/\.[^/.]+$/, '');
    const filename = `${Date.now()}-${baseName}.webp`;
    const outputPath = path.join(uploadPath, filename);

    const capturedAt = extractImageDate(file.buffer);

    await sharp(file.buffer)
      .resize({ width: MAX_STORED_WIDTH, withoutEnlargement: true })
      .toFormat('webp')
      .webp({ quality: WEBP_QUALITY, nearLossless: true })
      .toFile(outputPath);

    return { filename, capturedAt };
  }

  async readAsWebp(
    entityType: string,
    imageUrl: string,
    resizeWidth?: number,
  ): Promise<Buffer> {
    const localPath = this.resolveLocalPath(entityType, imageUrl);
    // No fs.access() pre-check — it creates a TOCTOU race (file can
    // disappear between the check and the open). Let sharp throw ENOENT
    // directly and translate it here.
    let transform = sharp(localPath);
    if (resizeWidth !== undefined && resizeWidth > 0) {
      transform = transform.resize({ width: resizeWidth, withoutEnlargement: true });
    }
    try {
      return await transform.toFormat('webp').toBuffer();
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('File on disk');
      }
      throw err;
    }
  }

  async remove(entityType: string, imageUrl: string): Promise<void> {
    const localPath = this.resolveLocalPath(entityType, imageUrl);
    try {
      await fs.unlink(localPath);
      log.debug(`Deleted image: ${path.basename(localPath)}`);
    } catch {
      // Missing files are not an error for deletion — the goal state
      // (file gone) is already reached.
      log.warn(`Unlink failed (file may not exist): ${path.basename(localPath)}`);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private resolveLocalPath(entityType: string, imageUrl: string): string {
    // Stored URLs are absolute (protocol://host/uploads/type/file.webp);
    // only the basename maps back to the local directory layout.
    const filename = path.basename(imageUrl);
    return path.join(this.rootDir, entityType, filename);
  }
}
