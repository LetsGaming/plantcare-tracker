/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { contrastRatio } from "@/utils/contrast";

const css = fs
  .readFileSync(path.resolve(__dirname, "../theme/variables.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

const blockBody = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(css.indexOf("{", start) + 1, i);
  }
  return "";
};

const parseTokens = (body: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
};

const light = parseTokens(blockBody(":root"));
const dark = { ...light, ...parseTokens(blockBody(":root.ion-palette-dark")) };

const resolve = (tokens: Record<string, string>, name: string): string => {
  const value = tokens[name];
  const ref = value?.match(/^var\((--[\w-]+)\)$/);
  return ref ? tokens[ref[1]] : value;
};

type Pair = [fg: string, bg: string, light: number, dark: number];

const pairs: Pair[] = [
  ["--feed-organic", "--surface-raised", 7, 8],
  ["--feed-mineral", "--surface-raised", 6, 6.4],
  ["--feed-organic-contrast", "--feed-organic", 6.7, 6.7],
  ["--feed-mineral-contrast", "--feed-mineral", 6.7, 6.7],
  ["--new-ink", "--new", 9.7, 9.7],
  ["--ink-soft", "--surface-sunken", 5.8, 5.8],
  ["--control-border", "--surface-raised", 3, 3],
  ["--focus-ring", "--ion-background-color", 5.69, 5.7],
  ["--overdue-ink", "--surface-raised", 5.7, 5.7],
  ["--series-1", "--surface-raised", 4.3, 4.3],
  ["--series-2", "--surface-raised", 4.3, 4.3],
  ["--series-3", "--surface-raised", 4.3, 4.3],
  ["--series-4", "--surface-raised", 4.3, 4.3],
  ["--series-5", "--surface-raised", 4.3, 4.3],
  ["--ion-text-color", "--danger-wash", 11, 11],
  ["--ion-text-color", "--warning-wash", 11, 11],
];

describe("theme tokens", () => {
  it("parses both theme blocks", () => {
    expect(Object.keys(light).length).toBeGreaterThan(50);
    expect(dark["--surface-raised"]).not.toBe(light["--surface-raised"]);
  });

  describe.each([
    ["light", light, 2],
    ["dark", dark, 3],
  ] as const)("%s contrast", (_name, tokens, minIndex) => {
    it.each(pairs)("%s on %s", (fg, bg, ...mins) => {
      const a = resolve(tokens, fg);
      const b = resolve(tokens, bg);
      expect(a, fg).toBeTruthy();
      expect(b, bg).toBeTruthy();
      expect(contrastRatio(a, b)).toBeGreaterThanOrEqual(mins[minIndex - 2]);
    });
  });

  it("defines every semantic token in light and overrides the theme-specific ones in dark", () => {
    const shared = [
      "--chrome-bg",
      "--nav-idle",
      "--control-border",
      "--feed-organic",
      "--feed-organic-contrast",
      "--feed-mineral",
      "--feed-mineral-contrast",
      "--new",
      "--new-ink",
      "--danger-wash",
      "--warning-wash",
      "--offline-bg",
      "--overdue-ink",
      "--category-ink",
      "--series-1",
      "--series-2",
      "--series-3",
      "--series-4",
      "--series-5",
      "--z-banner",
      "--clay",
      "--leaf",
    ];
    for (const name of shared) expect(light[name], name).toBeTruthy();
    const darkOnly = parseTokens(blockBody(":root.ion-palette-dark"));
    const overridden = [
      "--chrome-bg",
      "--control-border",
      "--feed-organic",
      "--feed-organic-contrast",
      "--feed-mineral",
      "--feed-mineral-contrast",
      "--new",
      "--danger-wash",
      "--warning-wash",
      "--series-1",
      "--series-2",
      "--series-3",
      "--series-4",
      "--series-5",
    ];
    for (const name of overridden) expect(darkOnly[name], name).toBeTruthy();
  });

  it("aliases the border color and chart colors to their single source", () => {
    expect(light["--ion-border-color"]).toBe("var(--line)");
    expect(parseTokens(blockBody(":root.ion-palette-dark"))["--ion-border-color"]).toBe(
      "var(--line)",
    );
    expect(light["--chart-1"]).toBe("var(--ion-color-primary)");
    expect(light["--chart-2"]).toBe("var(--ion-color-secondary)");
    expect(light["--chart-3"]).toBe("var(--ion-color-tertiary)");
    expect(light["--chart-6"]).toBe("var(--ion-color-medium)");
  });
});
