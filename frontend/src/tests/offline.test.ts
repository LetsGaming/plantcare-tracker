import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import OfflineBanner from "@/components/ui/OfflineBanner.vue";
import { networkState, setOnline, watchConnectivity } from "@/utils/network";
import { clearRuntimeCaches } from "@/pwa";

describe("network state", () => {
  beforeEach(() => setOnline(true));

  it("follows online and offline window events and unsubscribes", () => {
    const stop = watchConnectivity(window);
    window.dispatchEvent(new Event("offline"));
    expect(networkState.online).toBe(false);
    window.dispatchEvent(new Event("online"));
    expect(networkState.online).toBe(true);
    stop();
    window.dispatchEvent(new Event("offline"));
    expect(networkState.online).toBe(true);
  });
});

describe("OfflineBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
  });
  afterEach(() => vi.useRealTimers());

  it("renders nothing while online", () => {
    const wrapper = mount(OfflineBanner);
    expect(wrapper.find(".offline-banner").exists()).toBe(false);
    expect(wrapper.attributes("role")).toBe("status");
  });

  it("shows the offline message, then a confirmation that hides itself", async () => {
    const wrapper = mount(OfflineBanner, { props: { confirmationMs: 1000 } });
    setOnline(false);
    await nextTick();
    expect(wrapper.text()).toContain("offline.banner");

    setOnline(true);
    await nextTick();
    expect(wrapper.text()).toContain("offline.backOnline");

    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(wrapper.find(".offline-banner").exists()).toBe(false);
  });
});

describe("OfflineBanner stacking", () => {
  const root = document.documentElement;
  const readHeight = () => root.style.getPropertyValue("--offline-h");

  beforeEach(() => {
    vi.useFakeTimers();
    setOnline(true);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(52);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    root.style.removeProperty("--offline-h");
  });

  it("renders a decorative icon before the offline message", async () => {
    const wrapper = mount(OfflineBanner, { attachTo: document.body });
    setOnline(false);
    await nextTick();
    const icon = wrapper.find(".offline-banner ion-icon");
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("aria-hidden")).toBe("true");
    expect(wrapper.text()).toContain("offline.banner");
    wrapper.unmount();
  });

  it("publishes the banner height while visible and clears it when hidden", async () => {
    const wrapper = mount(OfflineBanner, {
      props: { confirmationMs: 1000 },
      attachTo: document.body,
    });
    expect(readHeight()).toBe("");
    setOnline(false);
    await nextTick();
    await nextTick();
    expect(readHeight()).toBe("52px");

    setOnline(true);
    await nextTick();
    await nextTick();
    expect(readHeight()).toBe("52px");

    vi.advanceTimersByTime(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(readHeight()).toBe("");
    wrapper.unmount();
  });

  it("clears the published height on unmount", async () => {
    const wrapper = mount(OfflineBanner, { attachTo: document.body });
    setOnline(false);
    await nextTick();
    await nextTick();
    expect(readHeight()).toBe("52px");
    wrapper.unmount();
    expect(readHeight()).toBe("");
  });

  it("re-measures on window resize", async () => {
    const wrapper = mount(OfflineBanner, { attachTo: document.body });
    setOnline(false);
    await nextTick();
    await nextTick();
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(78);
    window.dispatchEvent(new Event("resize"));
    expect(readHeight()).toBe("78px");
    wrapper.unmount();
    window.dispatchEvent(new Event("resize"));
    expect(readHeight()).toBe("");
  });

  it("styles the region as a fixed layer above the page", () => {
    const sources = import.meta.glob("../**/*.vue", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const source = sources["../components/ui/OfflineBanner.vue"];
    expect(source.length).toBeGreaterThan(0);
    const region = source.match(/\.offline-region\s*\{[^}]*\}/)?.[0] ?? "";
    expect(region).toContain("position: fixed");
    expect(region).toContain("var(--z-banner)");
    const appSource = sources["../App.vue"];
    expect(appSource).toContain("<offline-banner />");
  });

  it("offsets the split pane by the published height", () => {
    const css = readFileSync(resolve(__dirname, "../theme/custom.css"), "utf8");
    expect(css.length).toBeGreaterThan(0);
    expect(css).toMatch(/ion-split-pane\s*\{[^}]*top:\s*var\(--offline-h,\s*0px\)/);
  });
});

describe("clearRuntimeCaches", () => {
  it("keeps precache entries and deletes the rest", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["workbox-precache-v2-x", "uploads", "other"],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
    });
    await clearRuntimeCaches();
    expect(deleted).toEqual(["uploads", "other"]);
    vi.unstubAllGlobals();
  });
});
