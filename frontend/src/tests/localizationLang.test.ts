import { describe, it, expect, beforeEach, vi } from "vitest";

import localizationService from "@/services/general/LocalizationService";

beforeEach(() => {
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

  it("applies the stored locale when the service is constructed", async () => {
    localStorage.setItem("pc_locale", "de");
    document.documentElement.lang = "en";
    vi.resetModules();

    const fresh = (await import("@/services/general/LocalizationService")).default;

    expect(fresh.getLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("applies the browser language when nothing is stored", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE", "en"]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("de-DE");
    document.documentElement.lang = "en";
    vi.resetModules();

    await import("@/services/general/LocalizationService");

    expect(document.documentElement.lang).toBe("de");
  });
});
