/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);

import { setDarkMode, isDarkMode } from "@/theme/darkMode";

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
