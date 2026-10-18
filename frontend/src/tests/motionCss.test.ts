/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vueFiles = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const read = (rel: string): string => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");

const component = (name: string): string => {
  const key = Object.keys(vueFiles).find((file) => file.endsWith(`/${name}.vue`));
  expect(key, `${name}.vue is scanned`).toBeDefined();
  return vueFiles[key as string];
};

const reducedBlock = (source: string): string => {
  const start = source.indexOf("prefers-reduced-motion: reduce");
  return start === -1 ? "" : source.slice(start);
};

describe("reduced motion", () => {
  it("scans the component sources", () => {
    expect(Object.keys(vueFiles).length).toBeGreaterThan(20);
  });

  it("no longer zeroes every transition and animation globally", () => {
    const css = read("theme/custom.css");
    expect(css.length).toBeGreaterThan(0);
    expect(css).not.toContain("0.01ms");
  });

  it("pulses the skeleton with opacity instead of animating the background", () => {
    const source = component("StateBlock");
    expect(source).not.toContain("background-position");
    expect(source).not.toContain("background-size");
    const keyframes = source.slice(source.indexOf("@keyframes skeleton-pulse"));
    expect(keyframes).toContain("opacity");
  });

  it("stops the skeleton pulse under reduced motion", () => {
    expect(reducedBlock(component("StateBlock"))).toContain("animation: none");
  });

  it("drops the offline banner entrance under reduced motion", () => {
    expect(reducedBlock(component("OfflineBanner"))).toContain("animation: none");
  });

  it("hands the reduced motion preference to Ionic", () => {
    expect(read("main.ts")).toContain("ionicConfig()");
  });
});
