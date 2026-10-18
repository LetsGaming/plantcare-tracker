import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), upload: vi.fn() }));
vi.mock("@/utils/apiUtils", () => ({ default: api }));
const feedback = vi.hoisted(() => ({
  handleRequest: vi.fn((request: Promise<unknown>) => request),
  withoutErrorToasts: vi.fn((run: () => Promise<unknown>) => run()),
}));
vi.mock("@/utils/requestFeedback", () => feedback);

const toast = vi.hoisted(() => ({ showError: vi.fn() }));
vi.mock("@/services/general/ToastService", () => ({ default: toast }));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key },
}));

const resize = vi.hoisted(() => ({ downscaleImage: vi.fn(async (file: File) => file) }));
vi.mock("@/utils/imageResize", () => ({
  SNAP_MAX_WIDTH: 768,
  downscaleImage: resize.downscaleImage,
}));

import RecognitionService from "@/services/RecognitionService";

const apiError = (status: number, message = "Unreadable image") =>
  Object.assign(new Error(message), { name: "ApiError", status });

describe("RecognitionService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports availability quietly", async () => {
    api.get.mockResolvedValue({ available: true });
    await expect(RecognitionService.status()).resolves.toBe(true);
    expect(api.get).toHaveBeenCalledWith("/recognition/status");
    expect(feedback.withoutErrorToasts).toHaveBeenCalled();
  });

  it("treats a failing status request as unavailable", async () => {
    api.get.mockRejectedValue(new Error("offline"));
    await expect(RecognitionService.status()).resolves.toBe(false);
  });

  it("uploads the photo as the image field", async () => {
    const result = { snapshotId: "s", threshold: 0.8, candidates: [] };
    api.upload.mockResolvedValue(result);
    const photo = new File(["x"], "p.jpg", { type: "image/jpeg" });
    await expect(RecognitionService.match(photo)).resolves.toBe(result);
    const [endpoint, form] = api.upload.mock.calls[0];
    expect(endpoint).toBe("/recognition/match");
    expect((form as FormData).get("image")).toBeInstanceOf(File);
    expect(feedback.withoutErrorToasts).toHaveBeenCalled();
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("uploads the 768 px version of the photo", async () => {
    api.upload.mockResolvedValue({});
    const small = new File(["s"], "p.webp", { type: "image/webp" });
    resize.downscaleImage.mockResolvedValueOnce(small);
    const photo = new File(["x"], "p.jpg", { type: "image/jpeg" });
    await RecognitionService.match(photo);
    expect(resize.downscaleImage).toHaveBeenCalledWith(photo, 768);
    const form = api.upload.mock.calls[0][1] as FormData;
    expect((form.get("image") as File).name).toBe("p.webp");
  });

  it.each([
    [400, "water.snap_unreadable"],
    [429, "water.snap_busy"],
    [503, "water.snap_unavailable"],
    [500, "recognition.match"],
  ])("shows a localized message for HTTP %i, never the server text", async (status, key) => {
    api.upload.mockRejectedValue(apiError(status));
    const photo = new File(["x"], "p.jpg", { type: "image/jpeg" });
    await expect(RecognitionService.match(photo)).rejects.toMatchObject({ status });
    expect(toast.showError).toHaveBeenCalledWith(key);
  });

  it("uses the generic message for a network failure", async () => {
    api.upload.mockRejectedValue(new TypeError("Failed to fetch"));
    const photo = new File(["x"], "p.jpg", { type: "image/jpeg" });
    await expect(RecognitionService.match(photo)).rejects.toThrow("Failed to fetch");
    expect(toast.showError).toHaveBeenCalledWith("recognition.match");
  });

  it("confirms a snapshot with the given body", async () => {
    api.post.mockResolvedValue({ recordId: 5, imageId: null });
    const body = { plantId: 3, keepPhoto: true };
    await expect(RecognitionService.confirm("abc", body)).resolves.toEqual({
      recordId: 5,
      imageId: null,
    });
    expect(api.post).toHaveBeenCalledWith("/recognition/snapshots/abc/confirm", body);
    expect(feedback.handleRequest).toHaveBeenCalledWith(
      expect.anything(),
      "recognition.title",
      "recognition.confirm",
    );
  });
});
