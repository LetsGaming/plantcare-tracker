/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const read = (file: string): string => {
  const text = fs.readFileSync(path.resolve(__dirname, "../theme", file), "utf8");
  expect(text.length).toBeGreaterThan(0);
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
};

const custom = read("custom.css");
const scrollbar = read("scrollbar.css");

const vueFiles = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const ruleBody = (css: string, selector: string): string => {
  const start = css.indexOf(selector + " {");
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
};

describe("theme css", () => {
  it.each([
    "ion-button",
    "ion-tab-button",
    "ion-segment-button",
    "ion-select",
    "ion-menu-button",
    "ion-back-button",
    "ion-fab-button",
  ])("marks keyboard focus on %s through .ion-focused", (tag) => {
    expect(custom).toContain(`${tag}.ion-focused`);
  });

  it("does not use the clipped negative outline offset", () => {
    expect(custom).not.toContain("outline-offset: -3px");
  });

  it("sets idle segment and tab colors to the nav token", () => {
    expect(ruleBody(custom, "ion-segment-button")).toContain("--color: var(--nav-idle)");
    expect(ruleBody(custom, "ion-tab-button")).toContain("--color: var(--nav-idle)");
  });

  it("keeps back button and alert button labels in sentence case", () => {
    const rule =
      /ion-back-button,\s*ion-alert \.alert-button\s*\{([^}]*)\}/.exec(custom)?.[1] ?? "";
    expect(rule).toContain("text-transform: none");
  });

  it("has no dead ion-input.field-input block", () => {
    expect(custom).not.toContain("ion-input.field-input");
  });

  it("scrollbar.css derives colors from tokens without hex values", () => {
    expect(scrollbar).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(scrollbar).toContain("var(--surface-sunken)");
  });

  it("no component repeats the inline control border mix", () => {
    const offenders = Object.entries(vueFiles)
      .filter(([, src]) => src.includes("color-mix(in srgb, var(--ink-soft) 60%, var(--line))"))
      .map(([file]) => file);
    expect(Object.keys(vueFiles).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
