import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ionic/vue", () => ({
  modalController: {
    getTop: vi.fn().mockResolvedValue(null),
    dismiss: vi.fn().mockResolvedValue(undefined),
  },
}));

const load = async () => {
  vi.resetModules();
  return (await import("@/utils/utils")).default;
};

describe("settings from VITE variables", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "");
    vi.stubEnv("VITE_APP_TITLE", "");
    vi.stubEnv("VITE_CACHE_EXPIRE_HOURS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls back to defaults when every value is empty", async () => {
    const utils = await load();
    expect(utils.getApiBaseUrl()).toBe(
      `${window.location.protocol}//${window.location.hostname}:5000/api/v2`,
    );
    expect(utils.getAppTitle()).toBe("Plantcare Tracker");
    const now = Date.now();
    expect(utils.isCacheExpired(now - 5 * 3600_000)).toBe(false);
    expect(utils.isCacheExpired(now - 7 * 3600_000)).toBe(true);
  });

  it("uses the same origin in a production build", async () => {
    vi.stubEnv("MODE", "production");
    const utils = await load();
    expect(utils.getApiBaseUrl()).toBe("/api/v2");
    const now = Date.now();
    expect(utils.isCacheExpired(now - 23 * 3600_000)).toBe(false);
    expect(utils.isCacheExpired(now - 25 * 3600_000)).toBe(true);
  });

  it("takes configured values and trims a trailing slash", async () => {
    vi.stubEnv("VITE_API_URL", " http://plants.lan.net/api/v2/ ");
    vi.stubEnv("VITE_APP_TITLE", "My Plants");
    vi.stubEnv("VITE_CACHE_EXPIRE_HOURS", "1");
    const utils = await load();
    expect(utils.getApiBaseUrl()).toBe("http://plants.lan.net/api/v2");
    expect(utils.getAppTitle()).toBe("My Plants");
    const now = Date.now();
    expect(utils.isCacheExpired(now - 30 * 60_000)).toBe(false);
    expect(utils.isCacheExpired(now - 90 * 60_000)).toBe(true);
  });

  it("ignores a cache lifetime that is not a positive number", async () => {
    vi.stubEnv("VITE_CACHE_EXPIRE_HOURS", "soon");
    const utils = await load();
    expect(utils.isCacheExpired(Date.now() - 5 * 3600_000)).toBe(false);
    expect(utils.isCacheExpired(Date.now() - 7 * 3600_000)).toBe(true);
  });
});
