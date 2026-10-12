/**
 * modules/images/infrastructure/LocalImageStorage.ts
 *
 * Local-disk implementation of the ImageStorage port.
 *
 * Everything filesystem/Sharp/EXIF related that used to sit at the top
 * of imageRoutes.ts lives here now: capture-date extraction, filename
 * anonymisation, variant generation and deletion. The application layer
 * sees only the port.
 *
 * An upload is buffered once by the multipart layer; sharp decodes that
 * buffer a single time into a raw intermediate (at most 1024 px wide) and
 * the 160, 480 and 1024 px webp outputs are encoded from it. A module-level
 * semaphore bounds concurrent encodes.
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import ExifParser from 'exif-parser';
import type { ImageStorage, ProcessedUpload, UploadedFile, EntityType } from '../domain/Image';
import { ValidationError } from '../../../core/errors';
import { getConfig, getUploadsDirectory } from '../../../core/config';
import { createModuleLogger } from '../../../core/logging';
import { createSemaphore } from './semaphore';

const log = createModuleLogger('LocalImageStorage');

// ── Processing constants ──────────────────────────────────────────────────────

/** Widths of the generated variants; the largest one is the stored image_url. */
const VARIANT_WIDTHS = { small: 160, medium: 480, main: 1024 } as const;
/** webp quality for all variants. */
const WEBP_QUALITY = 78;
/** Uploads processed at the same time; further uploads queue. */
const MAX_CONCURRENT_UPLOADS = 2;
/** Upper bound for decoding one source image. */
const SOURCE_TIMEOUT_SECONDS = 30;
/** libvips worker threads per operation. */
const SHARP_CONCURRENCY = 2;
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
    .filter(
      (t) =>
        (t.length >= 2 && !PII_REDLIST.includes(t) && !/^\d+$/.test(t)) ||
        contextKeywords.includes(t),
    );

  const base = tokens.length > 0 ? tokens.join('-') : 'image';
  const hash = crypto.randomBytes(6).toString('hex');
  return `${base.substring(0, FILENAME_BASE_MAX_LENGTH)}-${hash}${ext}`;
};

const uploadSlots = createSemaphore(MAX_CONCURRENT_UPLOADS);

let sharpConfigured = false;

/** Applies the process-wide sharp settings once; safe to call repeatedly. */
export const configureSharp = (): void => {
  if (sharpConfigured) return;
  sharpConfigured = true;
  sharp.concurrency(SHARP_CONCURRENCY);
  sharp.cache(false);
};

const toHex = (channel: number): string => channel.toString(16).padStart(2, '0');

const variantFilename = (filename: string, width: number): string =>
  filename.replace(/\.webp$/i, `-${width}.webp`);

const hasErrnoCode = (err: unknown): boolean =>
  typeof (err as NodeJS.ErrnoException | null)?.code === 'string';

const isPixelLimitError = (err: unknown): boolean =>
  err instanceof Error && /pixel limit/i.test(err.message);

configureSharp();

export interface LocalImageStorageOptions {
  rootDir?: string;
  maxInputPixels?: number;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class LocalImageStorage implements ImageStorage {
  private readonly rootDir: string;
  private readonly maxInputPixels: number | undefined;

  constructor(options: LocalImageStorageOptions = {}) {
    this.rootDir = options.rootDir ?? getUploadsDirectory();
    this.maxInputPixels = options.maxInputPixels;
  }

  processUpload(file: UploadedFile, entityType: EntityType): Promise<ProcessedUpload> {
    return uploadSlots.run(() => this.encode(file, entityType));
  }

  async remove(entityType: string, imageUrl: string, variants?: number): Promise<void> {
    const main = this.resolveLocalPath(entityType, imageUrl);
    await this.unlink(main);
    if (variants === 0) return;
    for (const width of [VARIANT_WIDTHS.small, VARIANT_WIDTHS.medium]) {
      await this.unlink(variantFilename(main, width));
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private async encode(file: UploadedFile, entityType: EntityType): Promise<ProcessedUpload> {
    const uploadPath = path.join(this.rootDir, entityType);
    await fs.mkdir(uploadPath, { recursive: true });

    const baseName = anonymizeImageName(file.originalName, [entityType]).replace(/\.[^/.]+$/, '');
    const filename = `${Date.now()}-${baseName}.webp`;
    const mainPath = path.join(uploadPath, filename);
    const smallPath = variantFilename(mainPath, VARIANT_WIDTHS.small);
    const mediumPath = variantFilename(mainPath, VARIANT_WIDTHS.medium);

    const capturedAt = extractImageDate(file.buffer);
    const limitInputPixels = this.maxInputPixels ?? getConfig().uploadMaxPixels;

    const writeVariant = async (
      raw: Buffer,
      rawInfo: sharp.OutputInfo,
      width: number | null,
      target: string,
    ): Promise<Buffer> => {
      let pipeline = sharp(raw, {
        raw: { width: rawInfo.width, height: rawInfo.height, channels: rawInfo.channels },
      });
      if (width !== null) pipeline = pipeline.resize({ width, withoutEnlargement: true });
      const encoded = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      await fs.writeFile(target, encoded);
      return encoded;
    };

    try {
      const { data, info } = await sharp(file.buffer, { failOn: 'error', limitInputPixels })
        .timeout({ seconds: SOURCE_TIMEOUT_SECONDS })
        .rotate()
        .resize({ width: VARIANT_WIDTHS.main, withoutEnlargement: true })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const settled = await Promise.allSettled([
        writeVariant(data, info, VARIANT_WIDTHS.small, smallPath).then(
          async (encoded) => (await sharp(encoded).stats()).dominant,
        ),
        writeVariant(data, info, VARIANT_WIDTHS.medium, mediumPath),
        writeVariant(data, info, null, mainPath),
      ]);
      const failed = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
      const dominant = (settled[0] as PromiseFulfilledResult<sharp.Stats['dominant']>).value;
      return {
        filename,
        capturedAt,
        width: info.width,
        height: info.height,
        placeholder: `#${toHex(dominant.r)}${toHex(dominant.g)}${toHex(dominant.b)}`,
        variants: 1,
      };
    } catch (err) {
      await Promise.all([mainPath, smallPath, mediumPath].map((p) => fs.rm(p, { force: true })));
      log.debug('Image processing failed', { reason: (err as Error)?.message });
      if (hasErrnoCode(err)) throw err;
      if (isPixelLimitError(err)) {
        throw new ValidationError(
          'The uploaded image has too many pixels. Please upload a smaller image.',
        );
      }
      throw new ValidationError('The uploaded file is not a valid image.');
    }
  }

  private async unlink(localPath: string): Promise<void> {
    try {
      await fs.unlink(localPath);
      log.debug(`Deleted image: ${path.basename(localPath)}`);
    } catch (err) {
      // Missing files are not an error for deletion: the goal state
      // (file gone) is already reached.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn(`Unlink failed: ${path.basename(localPath)}`, { reason: (err as Error).message });
      }
    }
  }

  private resolveLocalPath(entityType: string, imageUrl: string): string {
    // Stored URLs are absolute (protocol://host/uploads/type/file.webp);
    // only the basename maps back to the local directory layout.
    const filename = path.basename(imageUrl);
    return path.join(this.rootDir, entityType, filename);
  }
}
