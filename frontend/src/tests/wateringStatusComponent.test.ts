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
import { usePlantsStore } from "@/stores/plants";

const DAY = 86_400_000;

const mountStatus = (watering: Partial<WateringSummary> | null = null) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = useWateringStore(pinia);
  const plants = usePlantsStore(pinia);
  plants.mine.items = [
    {
      id: 1,
      name: "Monty",
      watering: watering && {
        lastWateredAt: null,
        lastFertilizedAt: null,
        avgIntervalDays: null,
        ...watering,
      },
    } as PlantView,
  ];
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

describe("WateringStatus without loaded records", () => {
  it("reads the plant summary and requests no history", async () => {
    const { wrapper, store } = mountStatus({
      lastWateredAt: Date.now() - 3 * DAY,
      avgIntervalDays: 4,
    });
    await flushPromises();
    expect(store.ensureRecords).not.toHaveBeenCalled();
    expect(store.isLoaded(1)).toBe(false);
    const text = wrapper.text();
    expect(text).toContain("3 days ago");
    expect(text).toContain("watering.records.frequency.days");
    wrapper.unmount();
  });

  it("says never watered for a plant with an empty summary", async () => {
    const { wrapper } = mountStatus({});
    await flushPromises();
    expect(wrapper.text()).toContain("plantdetail.never_watered");
    wrapper.unmount();
  });
});
