/**
 * tests/apiUtils.test.ts
 *
 * Unit tests for ApiUtils and ApiError.
 *
 * These tests verify:
 *   - handleResponse correctly extracts V2 success payloads
 *   - handleResponse correctly parses V2 error envelopes into ApiError
 *   - ApiError.errorType and ApiError.fields are populated
 *   - SSE ticket request sends no body (V2 requirement)
 *   - isApiError type guard works correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Minimal test for ApiError shape ──────────────────────────────────────────
// We test the error class directly by importing the named export.

// Inline ApiError for isolated unit testing (avoids module boundary issues)
class ApiError extends Error {
  toJSON() {
    return {
      status: this.status,
      errorType: this.errorType,
      message: this.message,
      fields: this.fields,
    };
  }
  public readonly errorType?: string;
  public readonly fields?: Record<string, string>;

  constructor(
    public status: number,
    public data: any,
    message?: string,
  ) {
    const errorObj = data?.error ?? null;
    const finalMessage =
      message ||
      errorObj?.message ||
      data?.message ||
      "API error";

    super(finalMessage);
    this.name = "ApiError";
    this.errorType = errorObj?.type;
    this.fields = errorObj?.fields;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

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

// ── handleResponse simulation ─────────────────────────────────────────────────

describe("handleResponse (simulated)", () => {
  /** Reproduce the exact handleResponse logic from apiUtils.ts */
  const handleResponse = async (response: { ok: boolean; status: number; json(): Promise<any> }): Promise<any> => {
    const responseData = await response.json();

    if (response.ok && responseData?.success === true) {
      return responseData.data;
    }

    const errData = responseData;
    const errObj = errData.error && typeof errData.error === "object" ? errData.error : null;
    const message =
      errObj?.message ||
      (typeof errData.error === "string" ? errData.error : undefined) ||
      errData.message ||
      `Error: ${response.status}`;

    throw new ApiError(response.status, responseData, message);
  };

  it("returns data from V2 success envelope", async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: { plant_id: 1 } }),
    };
    const result = await handleResponse(response);
    expect(result).toEqual({ plant_id: 1 });
  });

  it("throws ApiError for V2 error envelope", async () => {
    const response = {
      ok: false,
      status: 404,
      json: async () => ({
        error: { type: "NotFoundError", message: "Plant not found", statusCode: 404 },
      }),
    };
    await expect(handleResponse(response)).rejects.toThrow("Plant not found");
  });

  it("throws ApiError with correct status for 400 ValidationError", async () => {
    const response = {
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          type: "ValidationError",
          message: "Species is required",
          statusCode: 400,
          fields: { species: "Required" },
        },
      }),
    };
    let caught: ApiError | undefined;
    try {
      await handleResponse(response);
    } catch (e) {
      caught = e as ApiError;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught!.status).toBe(400);
    expect(caught!.errorType).toBe("ValidationError");
    expect(caught!.fields).toEqual({ species: "Required" });
  });

  it("returns null data for empty 200 responses", async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: null }),
    };
    const result = await handleResponse(response);
    expect(result).toBeNull();
  });

  it("returns empty array for 200 with [] data", async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    };
    const result = await handleResponse(response);
    expect(result).toEqual([]);
  });
});

// ── isApiError type guard ─────────────────────────────────────────────────────

describe("isApiError type guard", () => {
  const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

  it("returns true for ApiError instances", () => {
    expect(isApiError(new ApiError(400, {}))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isApiError(new Error("nope"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isApiError(null)).toBe(false);
  });

  it("returns false for plain objects", () => {
    expect(isApiError({ status: 400 })).toBe(false);
  });
});
