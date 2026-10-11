import { describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/stores/session", () => ({
  useSessionStore: () => ({ isGuest: false, userId: 1, role: "user" }),
}));

vi.mock("@/services/general/ToastService", () => ({
  default: {
    showError: vi.fn(),
    showSuccess: vi.fn(),
    showWarning: vi.fn(),
    showToastWithAction: vi.fn(),
  },
}));

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import SourceRow from "@/components/admin/SourceRow.vue";
import ItemsOverview, { type OverviewItem } from "@/components/overview/ItemsOverview.vue";
import PlantDetails from "@/views/plants/PlantDetails.vue";
import { usePlantsStore } from "@/stores/plants";

const source = (status: SourceStatus): SourceHealth =>
  ({
    key: "k",
    kind: "sales",
    seller: "Shop",
    status,
    strategy: null,
    itemCount: null,
    consecutiveFailures: 0,
    issues: [],
  }) as SourceHealth;

const mountRow = (status: SourceStatus, checkable = true) =>
  shallowMount(SourceRow, {
    props: { source: source(status), checkable },
    global: { renderStubDefaultSlot: true },
  });

describe("SourceRow re-check", () => {
  it("is offered only for degraded and failing sources", () => {
    expect(mountRow("ok").find(".check").exists()).toBe(false);
    expect(mountRow("unknown").find(".check").exists()).toBe(false);
    expect(mountRow("degraded").find(".check").exists()).toBe(true);
    expect(mountRow("failing").find(".check").exists()).toBe(true);
  });

  it("is never offered when the source is not checkable", () => {
    expect(mountRow("failing", false).find(".check").exists()).toBe(false);
    expect(mountRow("degraded", false).find(".check").exists()).toBe(false);
  });

  it("emits recheck with the source", async () => {
    const wrapper = mountRow("failing");
    await wrapper.find(".check").trigger("click");
    expect(wrapper.emitted("recheck")?.[0]).toEqual([wrapper.props("source")]);
  });
});

const mountOverview = (items: OverviewItem[]) =>
  shallowMount(ItemsOverview, {
    props: { items, onItemClick: vi.fn(), onRefreshItems: vi.fn(async () => {}) },
    global: { renderStubDefaultSlot: true },
  });

describe("ItemsOverview repeated text", () => {
  it("omits the new count when every visible item is new", () => {
    const wrapper = mountOverview([
      { id: 1, name: "A", isNew: true },
      { id: 2, name: "B", isNew: true },
    ]);
    expect(wrapper.find(".count-new").exists()).toBe(false);
  });

  it("keeps the new count when only some items are new", () => {
    const wrapper = mountOverview([
      { id: 1, name: "A", isNew: true },
      { id: 2, name: "B", isNew: false },
    ]);
    expect(wrapper.find(".count-new").exists()).toBe(true);
  });

  it("hides the status line of a never-watered plant but keeps the chip", () => {
    const wrapper = mountOverview([
      {
        id: 1,
        name: "A",
        statusLine: "Never watered",
        statusTone: "new",
        statusLabel: "Never watered",
      },
    ]);
    expect(wrapper.find(".status-line").exists()).toBe(false);
    expect(wrapper.find(".status-chip").exists()).toBe(true);
  });

  it("shows the status line for a due plant", () => {
    const wrapper = mountOverview([
      { id: 1, name: "A", statusLine: "Due", statusTone: "due", statusLabel: "Due" },
    ]);
    expect(wrapper.find(".status-line").exists()).toBe(true);
  });
});

const mountDetails = (images: unknown[]) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = usePlantsStore(pinia);
  store.items = [{ id: 5, userId: 1, name: "Monty", isPublic: true, images } as unknown as Plant];
  return shallowMount(PlantDetails, {
    props: { id: "5" },
    global: { plugins: [pinia], renderStubDefaultSlot: true },
  });
};

describe("PlantDetails hero and gallery", () => {
  it("marks the photo area when the plant has gallery images", async () => {
    const wrapper = mountDetails([{ id: 1, url: "/a.jpg" }]);
    await flushPromises();
    expect(wrapper.find(".area-photo").classes()).toContain("has-gallery");
  });

  it("keeps the hero visible when the plant has no gallery images", async () => {
    const wrapper = mountDetails([]);
    await flushPromises();
    expect(wrapper.find(".area-photo").classes()).not.toContain("has-gallery");
  });

  it("hides the hero under the desktop breakpoint only", () => {
    const sources = import.meta.glob("../**/*.vue", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    expect(Object.keys(sources).length).toBeGreaterThan(20);
    const key = Object.keys(sources).find((k) => k.endsWith("views/plants/PlantDetails.vue"));
    const source = sources[key as string];
    expect(source).toMatch(
      /@media \(max-width: 899px\) \{\s*\.has-gallery \.hero \{\s*display: none;/,
    );
  });
});
