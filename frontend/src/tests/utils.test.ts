/**
 * tests/utils.test.ts
 *
 * Unit tests for the Utils helper module.
 *
 * Tests cover:
 *   - convertDateString: ISO → localized display string
 *   - convertToMillis: ISO → epoch ms
 *   - baseSearchFilter: multi-field search
 *   - isCacheExpired: timestamp expiry check
 *   - capitalizeFirstLetter
 *   - debounce
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// ── Mock Ionic Vue and config before importing Utils ──────────────────────────
vi.mock("@ionic/vue", () => ({
  modalController: {
    getTop: vi.fn().mockResolvedValue(null),
    dismiss: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/config.json", () => ({
  default: {
    development: {
      server: {
        base_url: "http://localhost",
        port: "5000",
        base_path: "/api",
        api_version: "/v2",
      },
      frontend: { app_title: "Test App" },
      storage: { expire_h: 6 },
    },
    production: {
      server: {
        base_url: "https://example.com",
        base_path: "/api",
        api_version: "/v2",
      },
      frontend: { app_title: "Test App" },
      storage: { expire_h: 24 },
    },
  },
}));

import Utils from "../utils/utils";

// ── convertDateString ─────────────────────────────────────────────────────────

describe("convertDateString", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = Utils.convertDateString("2025-01-15T08:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the original string for non-ISO input", () => {
    expect(Utils.convertDateString("not-a-date")).toBe("not-a-date");
    expect(Utils.convertDateString("01/15/2025")).toBe("01/15/2025");
  });

  it("handles date-only strings (no time component)", () => {
    const result = Utils.convertDateString("2025-03-01");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── convertToMillis ───────────────────────────────────────────────────────────

describe("convertToMillis", () => {
  it("returns a positive number for valid ISO strings", () => {
    expect(Utils.convertToMillis("2025-01-15T08:00:00.000Z")).toBeGreaterThan(0);
  });

  it("earlier dates produce smaller millis values", () => {
    const early = Utils.convertToMillis("2020-01-01T00:00:00.000Z");
    const late = Utils.convertToMillis("2025-01-01T00:00:00.000Z");
    expect(early).toBeLessThan(late);
  });
});

// ── isCacheExpired ────────────────────────────────────────────────────────────

describe("isCacheExpired", () => {
  const sixHourMs = 6 * 60 * 60 * 1000;

  it("returns false for a fresh timestamp", () => {
    expect(Utils.isCacheExpired(Date.now())).toBe(false);
  });

  it("returns true for a timestamp older than the expiry", () => {
    const oldTimestamp = Date.now() - sixHourMs - 1000;
    expect(Utils.isCacheExpired(oldTimestamp)).toBe(true);
  });

  it("returns false for a timestamp just within the expiry window", () => {
    const almostExpired = Date.now() - sixHourMs + 1000;
    expect(Utils.isCacheExpired(almostExpired)).toBe(false);
  });
});

// ── capitalizeFirstLetter ─────────────────────────────────────────────────────

describe("capitalizeFirstLetter", () => {
  it("capitalizes the first letter", () => {
    expect(Utils.capitalizeFirstLetter("hello")).toBe("Hello");
  });

  it("does not affect subsequent letters", () => {
    expect(Utils.capitalizeFirstLetter("hELLO")).toBe("HELLO");
  });

  it("returns empty string for empty input", () => {
    expect(Utils.capitalizeFirstLetter("")).toBe("");
  });

  it("handles single character", () => {
    expect(Utils.capitalizeFirstLetter("a")).toBe("A");
  });
});

// ── baseSearchFilter ──────────────────────────────────────────────────────────

describe("baseSearchFilter", () => {
  const plants = [
    { id: 1, name: "Monstera Deliciosa", species: "Monstera deliciosa" },
    { id: 2, name: "Peace Lily", species: "Spathiphyllum wallisii" },
    { id: 3, name: "Bird of Paradise", species: "Strelitzia reginae" },
  ];

  it("returns items matching a partial name query", () => {
    const result = Utils.baseSearchFilter("Monst", plants);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Monstera Deliciosa");
  });

  it("is case-insensitive", () => {
    const result = Utils.baseSearchFilter("PEACE", plants);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Peace Lily");
  });

  it("matches against all string fields", () => {
    const result = Utils.baseSearchFilter("Strelitzia", plants);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it("returns all items for an empty query", () => {
    expect(Utils.baseSearchFilter("", plants)).toHaveLength(3);
  });

  it("returns all items for a whitespace-only query", () => {
    expect(Utils.baseSearchFilter("   ", plants)).toHaveLength(3);
  });

  it("returns empty array when nothing matches", () => {
    expect(Utils.baseSearchFilter("zzz-no-match", plants)).toHaveLength(0);
  });

  it("returns input array unchanged when it is empty", () => {
    expect(Utils.baseSearchFilter("test", [])).toHaveLength(0);
  });

  it("trims whitespace from query before matching", () => {
    const result = Utils.baseSearchFilter("  lily  ", plants);
    expect(result).toHaveLength(1);
  });
});

// ── debounce ──────────────────────────────────────────────────────────────────

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls function once after delay", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = Utils.debounce(fn, 300);

    debounced("a");
    debounced("b");
    debounced("c");

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("resets timer on each call", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = Utils.debounce(fn, 200);

    debounced("first");
    vi.advanceTimersByTime(100);
    debounced("second");
    vi.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });
});

