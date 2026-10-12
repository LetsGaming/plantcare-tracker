/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import storageService from "@/services/general/StorageService";
import { setDarkMode, isDarkMode, applyInitialTheme, THEME_MIRROR_KEY } from "@/theme/darkMode";
import vite from "../../vite.config";

const root = document.documentElement;

const metaContent = (): string | null =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#000001" />';
  root.classList.remove("ion-palette-dark");
  root.style.removeProperty("--chrome-bg");
});

describe("setDarkMode", () => {
  it("toggles the palette class", async () => {
    await setDarkMode(true);
    expect(isDarkMode()).toBe(true);
    await setDarkMode(false);
    expect(isDarkMode()).toBe(false);
  });

  it("mirrors the chrome token of the active theme into theme-color", async () => {
    root.style.setProperty("--chrome-bg", "#14221a");
    await setDarkMode(true);
    expect(metaContent()).toBe("#14221a");

    root.style.setProperty("--chrome-bg", " #ffffff ");
    await setDarkMode(false);
    expect(metaContent()).toBe("#ffffff");
  });

  it("keeps the previous content when the token is unavailable", async () => {
    await setDarkMode(true);
    expect(metaContent()).toBe("#000001");
  });
});

describe("theme mirror", () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  });

  it("is written when the theme changes", async () => {
    await setDarkMode(true);
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe("dark");
    await setDarkMode(false);
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe("light");
  });

  it("decides the first paint without waiting for storage", () => {
    localStorage.setItem(THEME_MIRROR_KEY, "dark");
    vi.mocked(storageService.get).mockReturnValueOnce(new Promise(() => undefined));
    void applyInitialTheme();
    expect(isDarkMode()).toBe(true);
  });

  it("lets the stored choice win and refreshes the mirror", async () => {
    localStorage.setItem(THEME_MIRROR_KEY, "dark");
    vi.mocked(storageService.get).mockResolvedValueOnce(false);
    await applyInitialTheme();
    expect(isDarkMode()).toBe(false);
    expect(localStorage.getItem(THEME_MIRROR_KEY)).toBe("light");
  });

  it("survives an unavailable localStorage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await expect(setDarkMode(true)).resolves.toBeUndefined();
    await expect(applyInitialTheme()).resolves.toBeUndefined();
    vi.restoreAllMocks();
  });

  it("is read by the inline script in index.html under the same key", () => {
    const html = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
    expect(html).toContain(THEME_MIRROR_KEY);
  });
});

describe("build config", () => {
  const resolve = (vite as any).build.modulePreload.resolveDependencies as (
    file: string,
    deps: string[],
    context: { hostId: string; hostType: "html" | "js" },
  ) => string[];
  const deps = [
    "assets/vendor-ionic-a.js",
    "assets/vendor-charts-b.js",
    "assets/vendor-luxon-c.js",
  ];

  it("keeps vendor-charts out of the html modulepreload list", () => {
    const kept = resolve("index.html", deps, { hostId: "index.html", hostType: "html" });
    expect(kept.some((d) => d.includes("vendor-charts"))).toBe(false);
    expect(kept).toHaveLength(2);
  });
});

describe("source guards", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../theme/darkMode.ts"), "utf8");

  it("darkMode.ts holds no hex literal", () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  const vueFiles = import.meta.glob("../**/*.vue", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;

  it.each(["OverviewHeader.vue", "DetailsHeader.vue", "AdminHeader.vue", "SideMenu.vue"])(
    "%s no longer paints its header solid primary",
    (name) => {
      const entry = Object.entries(vueFiles).find(([file]) => file.endsWith("/" + name));
      expect(entry).toBeDefined();
      const text = entry![1];
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toContain("--background: var(--ion-color-primary)");
    },
  );
});
