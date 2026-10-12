import { readImageHeader, rememberCapturedAt } from "@/utils/exifDate";

export const UPLOAD_MAX_WIDTH = 1600;
export const SNAP_MAX_WIDTH = 768;
export const PASS_THROUGH_BYTES = 1.5 * 1024 * 1024;

const WEBP = "image/webp";
const JPEG = "image/jpeg";
const EXTENSIONS: Record<string, string> = { [WEBP]: "webp", [JPEG]: "jpg" };

export interface ResizeOptions {
  maxWidth: number;
  quality?: number;
}

export interface ResizedImage {
  blob: Blob;
  width: number;
  height: number;
  name: string;
}

const renamed = (name: string, type: string): string =>
  `${name.replace(/\.[^./\\]+$/, "") || "image"}.${EXTENSIONS[type] ?? "jpg"}`;

const orientedWidth = (width: number, height: number, orientation: number): number =>
  orientation >= 5 && orientation <= 8 ? height : width;

const encodeOffscreen = async (
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> => {
  if (typeof OffscreenCanvas === "undefined") return null;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  for (const type of [WEBP, JPEG]) {
    const blob = await canvas.convertToBlob({ type, quality });
    if (blob.type === type) return blob;
  }
  return null;
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

const encodeCanvas = async (
  bitmap: ImageBitmap,
  width: number,
  height: number,
  quality: number,
): Promise<Blob | null> => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  for (const type of [WEBP, JPEG]) {
    const blob = await toBlob(canvas, type, quality);
    if (blob && blob.type === type) return blob;
  }
  return null;
};

/**
 * Decodes once, rotated upright. The source width comes from the file header
 * so `resizeWidth` is only requested for images that are actually wider; the
 * final canvas step fixes whatever size the decoder returned.
 */
export const resizeImage = async (file: File, options: ResizeOptions): Promise<ResizedImage> => {
  const { maxWidth, quality = 0.8 } = options;
  if (typeof createImageBitmap === "undefined") throw new Error("createImageBitmap unavailable");

  const header = await readImageHeader(file);
  const knownWidth =
    header.width !== null && header.height !== null
      ? orientedWidth(header.width, header.height, header.orientation)
      : null;
  const small = file.size < PASS_THROUGH_BYTES;
  if (knownWidth !== null && knownWidth <= maxWidth && small) {
    return { blob: file, width: knownWidth, height: header.height ?? 0, name: file.name };
  }

  const decodeOptions: ImageBitmapOptions = { imageOrientation: "from-image" };
  if (knownWidth !== null && knownWidth > maxWidth) {
    decodeOptions.resizeWidth = maxWidth;
    decodeOptions.resizeQuality = "high";
  }
  const bitmap = await createImageBitmap(file, decodeOptions);
  try {
    if (bitmap.width <= maxWidth && small) {
      return { blob: file, width: bitmap.width, height: bitmap.height, name: file.name };
    }
    const width = Math.min(bitmap.width, maxWidth);
    const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
    const blob =
      (await encodeOffscreen(bitmap, width, height, quality)) ??
      (await encodeCanvas(bitmap, width, height, quality));
    if (!blob) throw new Error("image encoding unavailable");
    return { blob, width, height, name: renamed(file.name, blob.type) };
  } finally {
    bitmap.close?.();
  }
};

/**
 * The file to upload: downscaled when that works, otherwise the original, so
 * a missing browser API or a decode error never blocks an upload. A resized
 * file remembers the EXIF capture time, which the resize itself discards.
 */
export const downscaleImage = async (file: File, maxWidth: number): Promise<File> => {
  try {
    const capturedAt = (await readImageHeader(file)).capturedAt;
    const resized = await resizeImage(file, { maxWidth });
    if (resized.blob === file) return file;
    const result = new File([resized.blob], resized.name, {
      type: resized.blob.type,
      lastModified: file.lastModified,
    });
    if (capturedAt !== null) rememberCapturedAt(result, capturedAt);
    return result;
  } catch {
    return file;
  }
};
