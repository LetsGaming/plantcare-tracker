import { describe, it, expect } from "vitest";
import { contrastRatio, ensureContrast, readableInk } from "@/utils/contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#0e6b75", "#0e6b75")).toBeCloseTo(1, 5);
  });

  it("is symmetric and accepts 3-digit hex", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#1f6b3b")).toBeCloseTo(contrastRatio("#1f6b3b", "#fff"), 8);
  });

  it("returns 1 for invalid hex", () => {
    expect(contrastRatio("nope", "#ffffff")).toBe(1);
  });
});

describe("readableInk", () => {
  it("picks dark ink on bright fills and light ink on dark fills", () => {
    expect(readableInk("#ff9800")).toBe("#0e1812");
    expect(readableInk("#1f6b3b")).toBe("#ffffff");
  });

  it("returns the better of the two on a mid grey", () => {
    const ink = readableInk("#808080");
    const other = ink === "#0e1812" ? "#ffffff" : "#0e1812";
    expect(contrastRatio(ink, "#808080")).toBeGreaterThanOrEqual(contrastRatio(other, "#808080"));
  });

  it("honors custom ink colors", () => {
    expect(readableInk("#000000", "#111111", "#eeeeee")).toBe("#eeeeee");
  });
});

describe("ensureContrast", () => {
  it("lifts a failing color to the minimum ratio", () => {
    expect(contrastRatio("#2a4f9c", "#0f1a14")).toBeLessThan(3);
    const out = ensureContrast("#2a4f9c", "#0f1a14", 3);
    expect(out).not.toBe("#2a4f9c");
    expect(contrastRatio(out, "#0f1a14")).toBeGreaterThanOrEqual(3);
  });

  it("darkens on a light background", () => {
    const out = ensureContrast("#ffe066", "#ffffff", 4.5);
    expect(contrastRatio(out, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("returns the input unchanged when it already passes", () => {
    expect(ensureContrast("#ffffff", "#0f1a14", 4.5)).toBe("#ffffff");
  });

  it("falls back to the input for invalid hex", () => {
    expect(ensureContrast("blue", "#0f1a14", 4.5)).toBe("blue");
    expect(ensureContrast("#1E90FF", "zzz", 4.5)).toBe("#1E90FF");
  });

  it("accepts 3-digit hex", () => {
    const out = ensureContrast("#369", "#0f1a14", 4.5);
    expect(contrastRatio(out, "#0f1a14")).toBeGreaterThanOrEqual(4.5);
  });
});
