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
