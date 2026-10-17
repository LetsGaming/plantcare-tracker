import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ upload: vi.fn(async () => ({})), patchFile: vi.fn() }));
vi.mock("@/utils/apiUtils", () => ({ default: api }));
vi.mock("@/utils/requestFeedback", () => ({
  handleRequest: vi.fn((request: Promise<unknown>) => request),
}));

import { SNAP_MAX_WIDTH, UPLOAD_MAX_WIDTH, downscaleImage, resizeImage } from "@/utils/imageResize";
import { capturedAtOf, readExifDate, readImageHeader, rememberCapturedAt } from "@/utils/exifDate";
import ImageService from "@/services/ImageService";

interface JpegSpec {
  little?: boolean;
  date?: string | null;
  orientation?: number;
  width?: number;
  height?: number;
  exif?: boolean;
}

const buildJpeg = ({
  little = true,
  date = "2023:07:14 09:30:15",
  orientation = 1,
  width = 4000,
  height = 3000,
  exif = true,
}: JpegSpec = {}): Uint8Array<ArrayBuffer> => {
  const parts: number[] = [0xff, 0xd8];
  const u16 = (value: number, le = false) =>
    le ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff];
  const u32 = (value: number, le: boolean) =>
    le
      ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >>> 24) & 0xff]
      : [(value >>> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

  if (exif) {
    const tiff: number[] = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42, little)];
    tiff.push(...u32(8, little));
    tiff.push(...u16(2, little));
    tiff.push(...u16(0x0112, little), ...u16(3, little), ...u32(1, little));
    tiff.push(...u16(orientation, little), 0, 0);
    tiff.push(...u16(0x8769, little), ...u16(4, little), ...u32(1, little), ...u32(38, little));
    tiff.push(...u32(0, little));
    if (date === null) {
      tiff.push(...u16(0, little), ...u32(0, little));
    } else {
      tiff.push(...u16(1, little));
      tiff.push(...u16(0x9003, little), ...u16(2, little), ...u32(20, little), ...u32(56, little));
      tiff.push(...u32(0, little));
      for (const ch of date) tiff.push(ch.charCodeAt(0));
      tiff.push(0);
    }
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    parts.push(0xff, 0xe1, ...u16(body.length + 2), ...body);
  }
  parts.push(0xff, 0xc0, ...u16(17), 8, ...u16(height), ...u16(width), 3);
  parts.push(1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  parts.push(0xff, 0xd9);
  return Uint8Array.from(parts);
};

const jpegFile = (spec: JpegSpec = {}, padding = 0, name = "photo.jpg"): File =>
  new File([buildJpeg(spec), new Uint8Array(padding)], name, { type: "image/jpeg" });

const BIG = 2 * 1024 * 1024;

const stubBitmap = (width: number, height: number) => {
  const close = vi.fn();
  const create = vi.fn(async () => ({ width, height, close }));
  vi.stubGlobal("createImageBitmap", create);
  return { create, close };
};

const stubOffscreen = (typeFor: (requested: string) => string = (type) => type) => {
  const convertToBlob = vi.fn(
    async ({ type }: { type: string }) => new Blob(["img"], { type: typeFor(type) }),
  );
  const drawImage = vi.fn();
  class FakeOffscreen {
    constructor(
      public width: number,
      public height: number,
    ) {}
    getContext() {
      return { drawImage, imageSmoothingQuality: "low" };
    }
    convertToBlob = convertToBlob;
  }
  vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
  return { convertToBlob, drawImage };
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("readExifDate", () => {
  it.each([
    ["little endian", true],
    ["big endian", false],
  ])("reads DateTimeOriginal from a %s JPEG as local epoch ms", async (_label, little) => {
    const file = jpegFile({ little, date: "2023:07:14 09:30:15" });
    await expect(readExifDate(file)).resolves.toBe(new Date(2023, 6, 14, 9, 30, 15).getTime());
  });

  it("returns null without the tag, without EXIF, for malformed text and for non-JPEG", async () => {
    await expect(readExifDate(jpegFile({ date: null }))).resolves.toBeNull();
    await expect(readExifDate(jpegFile({ exif: false }))).resolves.toBeNull();
    await expect(readExifDate(jpegFile({ date: "0000:00:00 00:00:00" }))).resolves.toBeNull();
    const png = new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "a.png");
    await expect(readExifDate(png)).resolves.toBeNull();
    await expect(readExifDate(new File(["plain text"], "a.txt"))).resolves.toBeNull();
  });

  it("returns null for capture times the backend would reject", async () => {
    await expect(readExifDate(jpegFile({ date: "1980:01:01 00:00:00" }))).resolves.toBeNull();
    await expect(readExifDate(jpegFile({ date: "2099:01:01 00:00:00" }))).resolves.toBeNull();
  });

  it("resolves with what it could read from truncated or malicious headers", async () => {
    const jpeg = buildJpeg({ width: 640, height: 480 });
    const withHead = (head: number[]) => Uint8Array.from([0xff, 0xd8, ...head, ...jpeg.slice(2)]);
    const shortApp1 = withHead([0xff, 0xe1, 0x00, 0x08, 0x45, 0x78]);
    await expect(readImageHeader(new File([shortApp1], "a.jpg"))).resolves.toBeDefined();
    const zeroLength = withHead([0xff, 0xe1, 0x00, 0x00]);
    await expect(readImageHeader(new File([zeroLength], "b.jpg"))).resolves.toBeDefined();
    const hugeIfd = buildJpeg({ width: 640, height: 480 });
    new DataView(hugeIfd.buffer).setUint32(2 + 2 + 2 + 6 + 4, 0xfffffff0, true);
    await expect(readImageHeader(new File([hugeIfd], "c.jpg"))).resolves.toMatchObject({
      width: 640,
      height: 480,
    });
    const cutInExif = jpeg.slice(0, 20);
    await expect(readImageHeader(new File([cutInExif], "d.jpg"))).resolves.toMatchObject({
      orientation: 1,
    });
  });

  it("keeps the frame size found before a truncated segment", async () => {
    const sofFirst = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0xe0, 0x02, 0x80, 3, 1, 0x22, 0, 2, 0x11, 1, 3,
      0x11, 1, 0xff, 0xe1, 0x00, 0x20, 0x45,
    ]);
    await expect(readImageHeader(new File([sofFirst], "e.jpg"))).resolves.toMatchObject({
      width: 640,
      height: 480,
    });
  });

  it("reads orientation and frame size from the header", async () => {
    const header = await readImageHeader(jpegFile({ orientation: 6, width: 4000, height: 3000 }));
    expect(header).toMatchObject({ orientation: 6, width: 4000, height: 3000 });
  });
});

describe("resizeImage", () => {
  it("decodes upright with a resizeWidth for a wider image and re-encodes as webp", async () => {
    const { create, close } = stubBitmap(1600, 1200);
    const { convertToBlob, drawImage } = stubOffscreen();
    const file = jpegFile({ width: 4000, height: 3000 }, 0, "IMG_1.jpeg");

    const result = await resizeImage(file, { maxWidth: UPLOAD_MAX_WIDTH });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(file, {
      imageOrientation: "from-image",
      resizeWidth: 1600,
      resizeQuality: "high",
    });
    expect(convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: 0.8 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1200);
    expect(result).toMatchObject({ width: 1600, height: 1200, name: "IMG_1.webp" });
    expect(result.blob.type).toBe("image/webp");
    expect(close).toHaveBeenCalled();
  });

  it("uses the rotated width for EXIF orientations 5 to 8", async () => {
    const { create } = stubBitmap(768, 1024);
    stubOffscreen();
    const file = jpegFile({ orientation: 6, width: 4000, height: 3000 });
    await resizeImage(file, { maxWidth: SNAP_MAX_WIDTH });
    expect(create).toHaveBeenCalledWith(file, expect.objectContaining({ resizeWidth: 768 }));

    const rotatedNarrow = jpegFile({ orientation: 6, width: 4000, height: 1000 }, BIG);
    const narrow = stubBitmap(1000, 4000);
    await resizeImage(rotatedNarrow, { maxWidth: 1600 });
    expect(narrow.create).toHaveBeenCalledWith(rotatedNarrow, {
      imageOrientation: "from-image",
    });
  });

  it("never upscales and never asks for a resize when the image is narrow but heavy", async () => {
    const { create } = stubBitmap(800, 600);
    stubOffscreen();
    const result = await resizeImage(jpegFile({ width: 800, height: 600 }, BIG), {
      maxWidth: 1600,
    });
    expect(create).toHaveBeenCalledWith(expect.anything(), { imageOrientation: "from-image" });
    expect(result.width).toBe(800);
    expect(result.blob.type).toBe("image/webp");
  });

  it("passes small files that are already narrow through untouched", async () => {
    const { create } = stubBitmap(800, 600);
    const file = jpegFile({ width: 800, height: 600 }, 1000);
    const result = await resizeImage(file, { maxWidth: 1600 });
    expect(result.blob).toBe(file);
    expect(result.name).toBe(file.name);
    expect(create).not.toHaveBeenCalled();
  });

  it("decodes once when the header has no size and passes through a small result", async () => {
    const { create, close } = stubBitmap(500, 400);
    const file = new File([Uint8Array.from([1, 2, 3])], "odd.jpg", { type: "image/jpeg" });
    const result = await resizeImage(file, { maxWidth: 1600 });
    expect(create).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
    expect(result.blob).toBe(file);
    expect(close).toHaveBeenCalled();
  });

  it("falls back from webp to jpeg when the encoder does not support webp", async () => {
    stubBitmap(1600, 1200);
    const { convertToBlob } = stubOffscreen((type) => (type === "image/webp" ? "image/png" : type));
    const result = await resizeImage(jpegFile({ width: 4000, height: 3000 }), { maxWidth: 1600 });
    expect(convertToBlob.mock.calls.map(([options]) => options.type)).toEqual([
      "image/webp",
      "image/jpeg",
    ]);
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.name).toBe("photo.jpg");
  });

  describe("without OffscreenCanvas", () => {
    const stubDomCanvas = (typeFor: (requested: string) => string = (type) => type) => {
      vi.stubGlobal("OffscreenCanvas", undefined);
      const toBlob = vi.fn((callback: BlobCallback, type: string) =>
        callback(new Blob(["img"], { type: typeFor(type) })),
      );
      const drawImage = vi.fn();
      const fillRect = vi.fn();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage, fillRect, fillStyle: "", imageSmoothingQuality: "low" }),
        toBlob,
      };
      const create = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
        tag === "canvas" ? canvas : create(tag)) as typeof document.createElement);
      return { canvas, toBlob, fillRect, drawImage };
    };

    afterEach(() => vi.restoreAllMocks());

    it("encodes through HTMLCanvasElement.toBlob", async () => {
      stubBitmap(1600, 1200);
      const { canvas, toBlob } = stubDomCanvas();
      const result = await resizeImage(jpegFile({ width: 4000, height: 3000 }), {
        maxWidth: 1600,
        quality: 0.6,
      });
      expect(canvas).toMatchObject({ width: 1600, height: 1200 });
      expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.6);
      expect(result.blob.type).toBe("image/webp");
    });

    it("fills the canvas white before drawing so transparency does not turn black", async () => {
      stubBitmap(1600, 1200);
      const { fillRect, drawImage } = stubDomCanvas();
      await resizeImage(jpegFile({ width: 4000, height: 3000 }), { maxWidth: 1600 });
      expect(fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
      expect(fillRect.mock.invocationCallOrder[0]).toBeLessThan(
        drawImage.mock.invocationCallOrder[0],
      );
    });

    it("tries jpeg when webp comes back as another type", async () => {
      stubBitmap(1600, 1200);
      const { toBlob } = stubDomCanvas((type) => (type === "image/webp" ? "image/png" : type));
      const result = await resizeImage(jpegFile({ width: 4000, height: 3000 }), {
        maxWidth: 1600,
      });
      expect(toBlob.mock.calls.map((call) => call[1])).toEqual(["image/webp", "image/jpeg"]);
      expect(result.name).toBe("photo.jpg");
    });
  });
});

describe("downscaleImage", () => {
  it("returns the original file when createImageBitmap is missing", async () => {
    vi.stubGlobal("createImageBitmap", undefined);
    const file = jpegFile({}, BIG);
    await expect(downscaleImage(file, 1600)).resolves.toBe(file);
  });

  it("returns the original file when decoding fails", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("decode failed");
      }),
    );
    const file = jpegFile({}, BIG);
    await expect(downscaleImage(file, 1600)).resolves.toBe(file);
  });

  it("returns the original file when nothing can encode", async () => {
    stubBitmap(1600, 1200);
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("document", undefined);
    const file = jpegFile({ width: 4000, height: 3000 });
    await expect(downscaleImage(file, 1600)).resolves.toBe(file);
  });

  it("wraps the resized blob in a File that remembers the EXIF capture time", async () => {
    stubBitmap(1600, 1200);
    stubOffscreen();
    const file = jpegFile({ width: 4000, height: 3000, date: "2022:01:02 03:04:05" });
    const result = await downscaleImage(file, 1600);
    expect(result).not.toBe(file);
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("photo.webp");
    expect(capturedAtOf(result)).toBe(new Date(2022, 0, 2, 3, 4, 5).getTime());
  });
});

describe("downscaleImage header reads", () => {
  it("reads the header once per file", async () => {
    stubBitmap(1600, 1200);
    stubOffscreen();
    const file = jpegFile({ width: 4000, height: 3000 });
    const slice = vi.spyOn(file, "slice");
    await downscaleImage(file, 1600);
    expect(slice).toHaveBeenCalledTimes(1);
  });
});

describe("ImageService.uploadImage date", () => {
  const dateSent = () =>
    (api.upload.mock.calls.at(-1) as unknown as [string, FormData])[1].get("date");

  it("sends the remembered EXIF time in the existing date field when none was chosen", async () => {
    stubBitmap(1600, 1200);
    stubOffscreen();
    const resized = await downscaleImage(jpegFile({ width: 4000, height: 3000 }), 1600);
    await ImageService.uploadImage(resized, "plant", 1);
    expect(dateSent()).toBe(String(capturedAtOf(resized)));
  });

  it("keeps a date the user chose and sends none for plain files", async () => {
    stubBitmap(1600, 1200);
    stubOffscreen();
    const resized = await downscaleImage(jpegFile({ width: 4000, height: 3000 }), 1600);
    await ImageService.uploadImage(resized, "plant", 1, 1700000000000);
    expect(dateSent()).toBe("1700000000000");
    await ImageService.uploadImage(new File(["x"], "a.png", { type: "image/png" }), "plant", 1);
    expect(dateSent()).toBeNull();
  });

  it("sends a Date as epoch ms and drops dates the backend would reject", async () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    await ImageService.uploadImage(file, "plant", 1, new Date(2024, 5, 1));
    expect(dateSent()).toBe(String(new Date(2024, 5, 1).getTime()));
    await ImageService.uploadImage(file, "plant", 1, new Date("nope"));
    expect(dateSent()).toBeNull();
    await ImageService.uploadImage(file, "plant", 1, new Date(1980, 0, 1));
    expect(dateSent()).toBeNull();
    await ImageService.uploadImage(file, "plant", 1, "2024-06-01");
    expect(dateSent()).toBe(String(new Date("2024-06-01").getTime()));
  });

  it("sends no date when the remembered capture time is out of range", async () => {
    const old = new File(["x"], "old.webp", { type: "image/webp" });
    rememberCapturedAt(old, new Date(1980, 0, 1).getTime());
    await ImageService.uploadImage(old, "plant", 1);
    expect(dateSent()).toBeNull();
    const future = new File(["x"], "future.webp", { type: "image/webp" });
    rememberCapturedAt(future, Date.now() + 5 * 24 * 3600 * 1000);
    await ImageService.uploadImage(future, "plant", 1);
    expect(dateSent()).toBeNull();
  });
});
