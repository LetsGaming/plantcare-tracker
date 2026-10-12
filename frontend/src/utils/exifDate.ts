const HEADER_BYTES = 128 * 1024;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_ORIENTATION = 0x0112;
const SOF_SKIPPED = new Set([0xc4, 0xc8, 0xcc]);

export interface ImageHeader {
  width: number | null;
  height: number | null;
  orientation: number;
  capturedAt: number | null;
}

const EMPTY_HEADER: ImageHeader = { width: null, height: null, orientation: 1, capturedAt: null };

const readBytes = (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
};

const parseExifDate = (text: string): number | null => {
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return null;
  const time = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isNaN(time) ? null : time;
};

const parseTiff = (
  view: DataView,
  tiff: number,
): Pick<ImageHeader, "orientation" | "capturedAt"> => {
  const result = { orientation: 1, capturedAt: null as number | null };
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return result;
  const little = order === 0x4949;
  if (view.getUint16(tiff + 2, little) !== 42) return result;

  const entries = (ifd: number): number[] => {
    const start = tiff + ifd;
    if (start + 2 > view.byteLength) return [];
    const count = view.getUint16(start, little);
    const offsets: number[] = [];
    for (let i = 0; i < count; i++) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      offsets.push(entry);
    }
    return offsets;
  };

  let exifIfd: number | null = null;
  for (const entry of entries(view.getUint32(tiff + 4, little))) {
    const tag = view.getUint16(entry, little);
    if (tag === TAG_EXIF_IFD) exifIfd = view.getUint32(entry + 8, little);
    else if (tag === TAG_ORIENTATION) result.orientation = view.getUint16(entry + 8, little);
  }
  if (exifIfd === null) return result;

  for (const entry of entries(exifIfd)) {
    if (view.getUint16(entry, little) !== TAG_DATE_TIME_ORIGINAL) continue;
    const length = view.getUint32(entry + 4, little);
    const at = tiff + view.getUint32(entry + 8, little);
    if (length < 19 || at + 19 > view.byteLength) return result;
    let text = "";
    for (let i = 0; i < 19; i++) text += String.fromCharCode(view.getUint8(at + i));
    result.capturedAt = parseExifDate(text);
    return result;
  }
  return result;
};

const parseJpeg = (view: DataView): ImageHeader => {
  const header: ImageHeader = { ...EMPTY_HEADER };
  let pos = 2;
  while (pos + 4 <= view.byteLength) {
    if (view.getUint8(pos) !== 0xff) break;
    const marker = view.getUint8(pos + 1);
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      pos += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(pos + 2);
    const body = pos + 4;
    if (
      marker === 0xe1 &&
      length >= 8 &&
      view.getUint32(body) === 0x45786966 &&
      view.getUint16(body + 4) === 0
    ) {
      try {
        Object.assign(header, parseTiff(view, body + 6));
      } catch {
        // a truncated EXIF block still leaves the frame header readable
      }
    } else if (marker >= 0xc0 && marker <= 0xcf && !SOF_SKIPPED.has(marker)) {
      if (body + 5 <= view.byteLength) {
        header.height = view.getUint16(body + 1);
        header.width = view.getUint16(body + 3);
      }
    }
    pos += 2 + length;
  }
  return header;
};

const parsePng = (view: DataView): ImageHeader => {
  if (view.byteLength < 24) return { ...EMPTY_HEADER };
  return { ...EMPTY_HEADER, width: view.getUint32(16), height: view.getUint32(20) };
};

/** Reads size, EXIF orientation and capture time from the first bytes only; never throws. */
export const readImageHeader = async (file: Blob): Promise<ImageHeader> => {
  try {
    const view = new DataView(await readBytes(file.slice(0, HEADER_BYTES)));
    if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) return parseJpeg(view);
    if (view.byteLength >= 8 && view.getUint32(0) === 0x89504e47) return parsePng(view);
  } catch {
    // an unreadable header just means no metadata
  }
  return { ...EMPTY_HEADER };
};

/** EXIF DateTimeOriginal as epoch ms in local time, or null for non-JPEG and missing tags. */
export const readExifDate = async (file: Blob): Promise<number | null> =>
  (await readImageHeader(file)).capturedAt;

const capturedAtByFile = new WeakMap<Blob, number>();

export const rememberCapturedAt = (file: Blob, capturedAt: number): void => {
  capturedAtByFile.set(file, capturedAt);
};

export const capturedAtOf = (file: Blob): number | undefined => capturedAtByFile.get(file);
