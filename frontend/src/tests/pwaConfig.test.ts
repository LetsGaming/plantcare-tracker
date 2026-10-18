import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const config = fs.readFileSync(path.resolve(__dirname, "../../vite.config.ts"), "utf8");
const scrollbarCss = fs.readFileSync(path.resolve(__dirname, "../theme/scrollbar.css"), "utf8");

describe("service worker configuration", () => {
  it("caches same-origin upload variants cache first with a bounded, quota-safe cache", () => {
    expect(config).toContain('cacheName: "uploads"');
    expect(config).toMatch(
      /url\.origin === self\.location\.origin[\s\S]*?startsWith\("\/uploads\/"\)/,
    );
    expect(config).toMatch(/handler: "CacheFirst"/);
    expect(config).toMatch(/maxEntries: 300/);
    expect(config).not.toMatch(/maxEntries: 200/);
    expect(config).toMatch(/purgeOnQuotaError: true/);
  });

  it("keeps unused font subsets and maskable icons out of the precache", () => {
    expect(config).toContain('"**/*-latin-ext-*.woff2"');
    expect(config).toContain('"**/*-vietnamese-*.woff2"');
    expect(config).toContain('"**/maskable-*.png"');
    expect(config).toContain('globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico}"]');
  });

  it("keeps offline navigation and the chart preload filter", () => {
    expect(config).toContain('navigateFallback: "index.html"');
    expect(config).toContain("navigateFallbackDenylist");
    expect(config).toContain("vendor-charts");
  });

  it("preloads only the latin font files emitted by the build", () => {
    expect(config).toContain("transformIndexHtml");
    expect(config).toContain("ctx.bundle");
    expect(config).toContain('as: "font"');
    expect(config).not.toContain("latin-ext-wght");
  });
});

describe("scrollbar styling", () => {
  it("applies the thin scrollbar to the root and ion-content scrollers, never to every element", () => {
    expect(scrollbarCss).toMatch(/:root\s*\{[^}]*scrollbar-width: thin/);
    expect(scrollbarCss).toMatch(/ion-content::part\(scroll\)\s*\{[^}]*scrollbar-width: thin/);
    expect(scrollbarCss).not.toMatch(/(^|,)\s*\*\s*[,{]/m);
  });
});
