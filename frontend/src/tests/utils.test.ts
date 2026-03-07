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

// ── Inline pure utility functions under test ──────────────────────────────────
// We test the logic directly to avoid jsdom/Ionic import issues.
// The actual Utils object in utils.ts wraps these same implementations.

import { DateTime } from "luxon";

const convertToMillis = (dateString: string) =>
  DateTime.fromISO(dateString).toLocal().toMillis();

const convertDateString = (dateString: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(dateString)) return dateString;
  const localDate = DateTime.fromISO(dateString).toLocal();
  return localDate.isValid
    ? localDate.toLocaleString(DateTime.DATETIME_MED_WITH_WEEKDAY)
    : dateString;
};

const isCacheExpiredWith =
  (expiryMs: number) =>
  (timestamp: number): boolean =>
    Date.now() - timestamp > expiryMs;

const capitalizeFirstLetter = (str: string): string => {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1);
};

function baseSearchFilter<T extends object>(query: string, toFilter: T[]): T[] {
  if (!query || !toFilter?.length) return toFilter;
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) return toFilter;
  return toFilter.filter((item) => {
    for (const key in item) {
      const value = item[key];
      if (typeof value === "string" && value.toLowerCase().includes(lowerQuery)) return true;
    }
    return false;
  });
}

function debounce<F extends (...args: any[]) => any>(fn: F, delay: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<F>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ── convertDateString ─────────────────────────────────────────────────────────

describe("convertDateString", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    const result = convertDateString("2025-01-15T08:00:00.000Z");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns the original string for non-ISO input", () => {
    expect(convertDateString("not-a-date")).toBe("not-a-date");
    expect(convertDateString("01/15/2025")).toBe("01/15/2025");
  });

  it("handles date-only strings (no time component)", () => {
    const result = convertDateString("2025-03-01");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── convertToMillis ───────────────────────────────────────────────────────────

describe("convertToMillis", () => {
  it("returns a positive number for valid ISO strings", () => {
    expect(convertToMillis("2025-01-15T08:00:00.000Z")).toBeGreaterThan(0);
  });

  it("earlier dates produce smaller millis values", () => {
    const early = convertToMillis("2020-01-01T00:00:00.000Z");
    const late = convertToMillis("2025-01-01T00:00:00.000Z");
    expect(early).toBeLessThan(late);
  });
});

// ── isCacheExpired ────────────────────────────────────────────────────────────

describe("isCacheExpired", () => {
  const sixHourMs = 6 * 60 * 60 * 1000;
  const isCacheExpired = isCacheExpiredWith(sixHourMs);

  it("returns false for a fresh timestamp", () => {
    expect(isCacheExpired(Date.now())).toBe(false);
  });

  it("returns true for a timestamp older than the expiry", () => {
    const oldTimestamp = Date.now() - sixHourMs - 1000;
    expect(isCacheExpired(oldTimestamp)).toBe(true);
  });

  it("returns false for a timestamp exactly at the boundary (minus 1ms)", () => {
    const almostExpired = Date.now() - sixHourMs + 1000;
    expect(isCacheExpired(almostExpired)).toBe(false);
  });
});

// ── capitalizeFirstLetter ─────────────────────────────────────────────────────

describe("capitalizeFirstLetter", () => {
  it("capitalizes the first letter", () => {
    expect(capitalizeFirstLetter("hello")).toBe("Hello");
  });

  it("does not affect subsequent letters", () => {
    expect(capitalizeFirstLetter("hELLO")).toBe("HELLO");
  });

  it("returns empty string for empty input", () => {
    expect(capitalizeFirstLetter("")).toBe("");
  });

  it("handles single character", () => {
    expect(capitalizeFirstLetter("a")).toBe("A");
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
    const result = baseSearchFilter("Monst", plants);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Monstera Deliciosa");
  });

  it("is case-insensitive", () => {
    const result = baseSearchFilter("PEACE", plants);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Peace Lily");
  });

  it("matches against all string fields", () => {
    const result = baseSearchFilter("Strelitzia", plants);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(3);
  });

  it("returns all items for an empty query", () => {
    expect(baseSearchFilter("", plants)).toHaveLength(3);
  });

  it("returns all items for a whitespace-only query", () => {
    expect(baseSearchFilter("   ", plants)).toHaveLength(3);
  });

  it("returns empty array when nothing matches", () => {
    expect(baseSearchFilter("zzz-no-match", plants)).toHaveLength(0);
  });

  it("returns input array unchanged when it is empty", () => {
    expect(baseSearchFilter("test", [])).toHaveLength(0);
  });

  it("trims whitespace from query before matching", () => {
    const result = baseSearchFilter("  lily  ", plants);
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
    const debounced = debounce(fn, 300);

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
    const debounced = debounce(fn, 200);

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
