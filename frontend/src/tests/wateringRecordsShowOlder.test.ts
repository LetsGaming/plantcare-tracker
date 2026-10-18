import { describe, it, expect, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/services/general/ToastService", () => ({
  default: { showSuccess: vi.fn(), showError: vi.fn(), showToastWithAction: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import WateringRecords from "@/components/plants/watering/WateringRecords.vue";
import { useWateringStore } from "@/stores/watering";

const olderButton = (wrapper: ReturnType<typeof mountRecords>["wrapper"]) =>
  wrapper.find(".older button");

const mountRecords = (nextCursor: string | null) => {
  const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: true });
  const store = useWateringStore(pinia);
  store.byPlantId = { 1: { items: [], nextCursor, loadedAt: Date.now() } };
  const wrapper = mount(WateringRecords, {
    props: { plantId: 1 },
    global: {
      plugins: [pinia],
      stubs: {
        Calendar: true,
        WateringRecordModal: true,
        IonIcon: true,
        IonSpinner: true,
        IonButton: { template: "<button><slot /></button>" },
      },
    },
  });
  return { wrapper, store };
};

describe("WateringRecords show older button", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is hidden when everything is loaded and visible when older records remain", async () => {
    const all = mountRecords(null);
    await flushPromises();
    expect(olderButton(all.wrapper).exists()).toBe(false);

    const more = mountRecords("c1");
    await flushPromises();
    expect(olderButton(more.wrapper).exists()).toBe(true);
  });

  it("calls loadOlder, is disabled while loading and is enabled again afterwards", async () => {
    const { wrapper, store } = mountRecords("c1");
    await flushPromises();
    let release!: () => void;
    vi.mocked(store.loadOlder).mockReturnValue(new Promise<void>((res) => (release = res)));

    await olderButton(wrapper).trigger("click");
    expect(store.loadOlder).toHaveBeenCalledWith(1);
    expect(olderButton(wrapper).attributes("disabled")).toBeDefined();

    release();
    await flushPromises();
    expect(olderButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("resets the loading state when loadOlder fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { wrapper, store } = mountRecords("c1");
    await flushPromises();
    vi.mocked(store.loadOlder).mockRejectedValue(new Error("offline"));

    await olderButton(wrapper).trigger("click");
    await flushPromises();
    expect(olderButton(wrapper).attributes("disabled")).toBeUndefined();
  });
});
