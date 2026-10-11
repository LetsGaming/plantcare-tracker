import { describe, it, expect, beforeEach, vi } from "vitest";

import localizationService from "@/services/general/LocalizationService";

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("document language", () => {
  it("follows setLocale", async () => {
    localizationService.registerTranslations("de", { "x.y": "z" });
    localizationService.registerTranslations("en", { "x.y": "z" });

    await localizationService.setLocale("de");
    expect(document.documentElement.lang).toBe("de");

    await localizationService.setLocale("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("applies the stored locale once the initial bundle is resolved", async () => {
    localStorage.setItem("pc_locale", "de");
    document.documentElement.lang = "en";
    vi.resetModules();

    const fresh = (await import("@/services/general/LocalizationService")).default;
    fresh.registerTranslations("de", { "x.y": "z" });
    await fresh.resolveInitialLocale();

    expect(fresh.getLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("applies the browser language when nothing is stored", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE", "en"]);
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("de-DE");
    document.documentElement.lang = "en";
    vi.resetModules();

    const fresh = (await import("@/services/general/LocalizationService")).default;
    fresh.registerTranslations("de", { "x.y": "z" });
    await fresh.resolveInitialLocale();

    expect(document.documentElement.lang).toBe("de");
  });

  it("keeps the fallback language for an unsupported browser language", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["fr-FR"]);
    vi.spyOn(window.navigator, "language", "get").mockReturnValue("fr-FR");
    document.documentElement.lang = "en";
    vi.resetModules();

    const fresh = (await import("@/services/general/LocalizationService")).default;
    fresh.registerTranslations("en", { "x.y": "z" });
    fresh.registerTranslations("de", { "x.y": "z" });
    await fresh.resolveInitialLocale();

    expect(document.documentElement.lang).toBe("en");
  });

  it("does not announce an unsupported locale", async () => {
    localizationService.registerTranslations("de", { "x.y": "z" });
    await localizationService.setLocale("de");
    await localizationService.setLocale("xx");
    expect(document.documentElement.lang).toBe("en");

    await localizationService.setLocale("de");
    expect(document.documentElement.lang).toBe("de");
  });
});
