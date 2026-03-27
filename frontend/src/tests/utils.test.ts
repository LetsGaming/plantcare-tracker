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

import Utils from "@/utils/utils";

describe("convertDate", () => {
  // ── VALID INPUTS ─────────────────────────────────────────

  it("formats epoch milliseconds into a readable date", () => {
    const result = Utils.convertDate(1700000000000);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats epoch seconds correctly", () => {
    const seconds = 1700000000;
    const millis = 1700000000000;

    const fromSeconds = Utils.convertDate(seconds);
    const fromMillis = Utils.convertDate(millis);

    expect(fromSeconds).toBe(fromMillis);
  });

  it("formats ISO string into readable date", () => {
    const result = Utils.convertDate("2024-11-14T20:53:20.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats Date object correctly", () => {
    const date = new Date("2024-11-14T20:53:20.000Z");
    const result = Utils.convertDate(date);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  // ── ISO MODE ─────────────────────────────────────────

  it("returns ISO string when format = iso", () => {
    const result = Utils.convertDate(1700000000000, { format: "iso" });

    expect(result).toContain("202");
    expect(result).toContain("T");
    expect(result.endsWith("Z")).toBe(true);
  });

  // ── INVALID INPUTS ─────────────────────────────────────────

  it("returns original value for invalid string", () => {
    const result = Utils.convertDate("not-a-date");
    expect(result).toBe("not-a-date");
  });

  it("returns original value for NaN", () => {
    const result = Utils.convertDate(NaN as unknown as number);
    expect(result).toBe("NaN");
  });

  // ── BACKWARD COMPAT ─────────────────────────────────────────

  describe("convertDateMillis", () => {
    it("returns readable date string", () => {
      const result = Utils.convertDateMillis(1700000000000);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("matches convertDate readable output", () => {
      const epoch = 1700000000000;

      const a = Utils.convertDateMillis(epoch);
      const b = Utils.convertDate(epoch);

      expect(a).toBe(b);
    });
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

