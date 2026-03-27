/**
 * tests/apiUtils.test.ts
 *
 * Unit tests for ApiUtils and ApiError.
 *
 * These tests verify:
 *   - ApiError correctly extracts V2 error envelope fields
 *   - handleResponse correctly parses V2 success/error envelopes (via mocked fetch)
 *   - ApiError.errorType and ApiError.fields are populated
 *   - isApiError type guard works correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all dependencies of apiUtils.ts before importing it ─────────────────
vi.mock("@/services/general/ToastService", () => ({
  default: { showError: vi.fn(), showSuccess: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (_k: string, _v?: any, fallback?: string) => fallback ?? _k },
}));
vi.mock("../utils/tokenUtils", () => ({
  default: { getToken: vi.fn().mockResolvedValue(null) },
}));
vi.mock("../utils/utils", () => ({
  default: { getApiBaseUrl: vi.fn().mockReturnValue("http://test") },
}));
vi.mock("@/services/UserService", () => ({
  default: { refreshToken: vi.fn(), logout: vi.fn() },
}));

import ApiUtils, { ApiError } from "../utils/apiUtils";

// ── ApiError unit tests ───────────────────────────────────────────────────────

describe("ApiError", () => {
  describe("V2 structured error envelope { error: { type, message, statusCode, fields } }", () => {
    it("extracts message from error.message", () => {
      const err = new ApiError(400, {
        error: { type: "ValidationError", message: "Species is required", statusCode: 400 },
      });
      expect(err.message).toBe("Species is required");
    });

    it("sets errorType from error.type", () => {
      const err = new ApiError(400, {
        error: { type: "ValidationError", message: "Species is required", statusCode: 400 },
      });
      expect(err.errorType).toBe("ValidationError");
    });

    it("sets fields from error.fields (ValidationError)", () => {
      const err = new ApiError(400, {
        error: {
          type: "ValidationError",
          message: "Validation failed",
          statusCode: 400,
          fields: { species: "Required", name: "Too short" },
        },
      });
      expect(err.fields).toEqual({ species: "Required", name: "Too short" });
    });

    it("sets status code", () => {
      const err = new ApiError(404, { error: { type: "NotFoundError", message: "Not found", statusCode: 404 } });
      expect(err.status).toBe(404);
    });

    it("name is ApiError", () => {
      const err = new ApiError(500, {});
      expect(err.name).toBe("ApiError");
    });
  });

  describe("edge cases", () => {
    it("errorType is undefined when no error.type present", () => {
      const err = new ApiError(500, { message: "Server error" });
      expect(err.errorType).toBeUndefined();
    });

    it("fields is undefined when no validation errors", () => {
      const err = new ApiError(401, {
        error: { type: "UnauthorizedError", message: "Invalid token", statusCode: 401 },
      });
      expect(err.fields).toBeUndefined();
    });

    it("falls back to generic message when no message fields exist", () => {
      const err = new ApiError(500, {});
      expect(err.message).toBe("API error");
    });

    it("uses explicit message parameter when provided", () => {
      const err = new ApiError(500, {}, "Custom override message");
      expect(err.message).toBe("Custom override message");
    });

    it("toString returns formatted string", () => {
      const err = new ApiError(404, { error: { message: "Not found" } });
      expect(err.toString()).toBe("ApiError (404): Not found");
    });

    it("instanceof check works after setPrototypeOf", () => {
      const err = new ApiError(400, {});
      expect(err instanceof ApiError).toBe(true);
      expect(err instanceof Error).toBe(true);
    });
  });

  describe("toJSON", () => {
    it("serializes all relevant fields", () => {
      const err = new ApiError(400, {
        error: { type: "ValidationError", message: "Bad", fields: { x: "y" } },
      });
      const json = err.toJSON();
      expect(json.status).toBe(400);
      expect(json.errorType).toBe("ValidationError");
      expect(json.message).toBe("Bad");
      expect(json.fields).toEqual({ x: "y" });
    });
  });
});

// ── handleResponse (via mocked fetch + ApiUtils.get) ─────────────────────────

/** Helper: build a mock Response-like object */
function mockResponse(status: number, body: any) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe("handleResponse (via ApiUtils.get)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns data from success envelope", async () => {
    (global.fetch as any).mockResolvedValue(mockResponse(200, { data: { plant_id: 1 } }));
    const result = await ApiUtils.get("/test");
    expect(result).toEqual({ plant_id: 1 });
  });

  it("throws ApiError for V2 error envelope", async () => {
    (global.fetch as any).mockResolvedValue(
      mockResponse(404, { error: { type: "NotFoundError", message: "Plant not found", statusCode: 404 } }),
    );
    await expect(ApiUtils.get("/test")).rejects.toThrow("Plant not found");
  });

  it("throws ApiError with correct status and fields for 400 ValidationError", async () => {
    (global.fetch as any).mockResolvedValue(
      mockResponse(400, {
        error: { type: "ValidationError", message: "Species is required", statusCode: 400, fields: { species: "Required" } },
      }),
    );
    let caught: ApiError | undefined;
    try {
      await ApiUtils.get("/test");
    } catch (e) {
      caught = e as ApiError;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught!.status).toBe(400);
    expect(caught!.errorType).toBe("ValidationError");
    expect(caught!.fields).toEqual({ species: "Required" });
  });

  it("throws ApiError for V1 legacy string error envelope", async () => {
    (global.fetch as any).mockResolvedValue(
      mockResponse(400, { error: "Bad request" }),
    );
    await expect(ApiUtils.get("/test")).rejects.toThrow("Bad request");
  });

  it("throws ApiError using top-level message as fallback", async () => {
    (global.fetch as any).mockResolvedValue(
      mockResponse(500, { message: "Internal Server Error" }),
    );
    await expect(ApiUtils.get("/test")).rejects.toThrow("Internal Server Error");
  });

  it("throws ApiError with status fallback when no message field exists", async () => {
    (global.fetch as any).mockResolvedValue(mockResponse(503, {}));
    await expect(ApiUtils.get("/test")).rejects.toThrow("Error: 503");
  });

  it("returns null data for 200 with null data field", async () => {
    (global.fetch as any).mockResolvedValue(mockResponse(200, { data: null }));
    const result = await ApiUtils.get("/test");
    expect(result).toBeNull();
  });

  it("returns empty array for 200 with [] data field", async () => {
    (global.fetch as any).mockResolvedValue(mockResponse(200, { data: [] }));
    const result = await ApiUtils.get("/test");
    expect(result).toEqual([]);
  });

  it("returns null for 204 No Content", async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, status: 204, text: () => Promise.resolve("") });
    const result = await ApiUtils.get("/test");
    expect(result).toBeNull();
  });

  it("throws ApiError with raw text when JSON parsing fails", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("not json"),
    });
    await expect(ApiUtils.get("/test")).rejects.toThrow("not json");
  });
});

// ── isApiError type guard ─────────────────────────────────────────────────────

describe("isApiError type guard", () => {
  it("returns true for ApiError instances", () => {
    expect(ApiUtils.isApiError(new ApiError(400, {}))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(ApiUtils.isApiError(new Error("nope"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(ApiUtils.isApiError(null)).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(ApiUtils.isApiError({ status: 400 })).toBe(false);
  });
});

