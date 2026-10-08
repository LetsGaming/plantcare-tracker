import { describe, it, expect, vi, afterEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

const toast = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showToastWithAction: vi.fn(),
}));

vi.mock("@/services/general/ToastService", () => ({ default: toast }));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import WateringStatus from "@/components/plants/watering/WateringStatus.vue";
import { useWateringStore } from "@/stores/watering";

const mountStatus = () => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = useWateringStore(pinia);
  store.byPlantId = { 1: [] };
  const wrapper = shallowMount(WateringStatus, {
    props: { plantId: 1, plantName: "Monty", canWater: true },
    global: { plugins: [pinia] },
  });
  return { wrapper, store };
};

const stubReducedMotion = (reduced: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduced }) as typeof window.matchMedia;
};

describe("WateringStatus watering moment", () => {
  afterEach(() => vi.restoreAllMocks());

  it("toggles the status class on success and not on failure", async () => {
    stubReducedMotion(false);
    const { wrapper, store } = mountStatus();
    await flushPromises();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.mocked(store.addRecord).mockRejectedValueOnce(new Error("offline"));
    await (wrapper.vm as unknown as { waterNow(): Promise<void> }).waterNow();
    await flushPromises();
    expect(wrapper.classes()).not.toContain("just-watered");

    vi.mocked(store.addRecord).mockResolvedValueOnce({ id: 5 } as WateringRecord);
    await (wrapper.vm as unknown as { waterNow(): Promise<void> }).waterNow();
    await flushPromises();
    expect(wrapper.classes()).toContain("just-watered");
    wrapper.unmount();
  });

  it("skips the class when reduced motion is requested", async () => {
    stubReducedMotion(true);
    const { wrapper, store } = mountStatus();
    await flushPromises();
    vi.mocked(store.addRecord).mockResolvedValueOnce({ id: 6 } as WateringRecord);
    await (wrapper.vm as unknown as { waterNow(): Promise<void> }).waterNow();
    await flushPromises();
    expect(wrapper.classes()).not.toContain("just-watered");
    wrapper.unmount();
  });
});
