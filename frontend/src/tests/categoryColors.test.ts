import { describe, expect, it } from "vitest";
import {
  DEFAULT_WATERING_TOKENS,
  contrastTextColor,
  resolveCategoryColors,
} from "@/utils/categoryColors";
import { contrastRatio, ensureContrast } from "@/utils/contrast";

const INK = "#0e1812";

describe("contrastTextColor", () => {
  it("reaches 4.5:1 on pseudo-random backgrounds, or returns the better ink", () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };
    for (let i = 0; i < 50; i++) {
      const bg = `#${(next() % 0x1000000).toString(16).padStart(6, "0")}`;
      const ink = contrastTextColor(bg);
      const ratio = contrastRatio(ink, bg);
      const best = Math.max(contrastRatio(INK, bg), contrastRatio("#ffffff", bg));
      expect(ratio).toBe(best);
      if (best >= 4.5) expect(ratio).toBeGreaterThanOrEqual(4.5);
      else expect(contrastRatio(ensureContrast(bg, ink, 4.5), ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses dark ink on light and white on dark backgrounds", () => {
    expect(contrastTextColor("#ffffff")).toBe(INK);
    expect(contrastTextColor("#000000")).toBe("#ffffff");
  });
});

describe("resolveCategoryColors", () => {
  const tokens = { fallback: "#2b6cb0", page: "#0e1812" };
  const category = (backgroundColor: string, textColor = ""): Category => ({
    name: "x",
    textColor,
    backgroundColor,
  });

  it("uses the role token when the color is empty", () => {
    const resolved = resolveCategoryColors(category(""), tokens);
    expect(resolved.background).toBe("#2b6cb0");
    expect(resolved.text).toBe(contrastTextColor("#2b6cb0"));
  });

  it("lifts a user color to 3:1 against a dark page", () => {
    const resolved = resolveCategoryColors(category("#0a1a40"), tokens);
    expect(contrastRatio(resolved.background, tokens.page)).toBeGreaterThanOrEqual(3);
  });

  it("keeps a dark custom color at 3:1 on both the page and the lighter dark card", () => {
    const dark = { fallback: "#2b6cb0", page: "#0f1a14", surface: "#17261d" };
    for (const color of ["#1E90FF", "#0a1f5c", "#0a1a40", "#1e3a8a"]) {
      const resolved = resolveCategoryColors(category(color), dark);
      expect(contrastRatio(resolved.background, dark.page)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(resolved.background, dark.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps a light custom color at 3:1 on the white card", () => {
    const light = { fallback: "#2b6cb0", page: "#f3f6f0", surface: "#ffffff" };
    const resolved = resolveCategoryColors(category("#ffff66"), light);
    expect(contrastRatio(resolved.background, light.surface)).toBeGreaterThanOrEqual(3);
  });

  it("derives the ink from the background and ignores a stored textColor", () => {
    const light = resolveCategoryColors(category("#f5f5f5"), { fallback: "#000", page: "#ffffff" });
    expect(light.text).toBe(INK);
    const dark = resolveCategoryColors(category("#222222", "#99c2ff"), {
      fallback: "#000",
      page: "#ffffff",
    });
    expect(dark.text).toBe("#ffffff");
  });

  it("maps the watering categories to their tokens", () => {
    expect(DEFAULT_WATERING_TOKENS).toEqual({
      "watering.category.no_fertilizer": "--water",
      "watering.category.organic": "--feed-organic",
      "watering.category.mineral": "--feed-mineral",
    });
  });
});
