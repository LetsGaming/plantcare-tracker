import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

const toast = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showToastWithAction: vi.fn(),
}));

vi.mock("@/services/general/ToastService", () => ({ default: toast }));
vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  isApiError: () => false,
}));
vi.mock("@/utils/apiUtils", () => ({ default: api }));
vi.mock("@/services/RecognitionService", () => ({
  default: { status: vi.fn().mockResolvedValue(true) },
}));

import WaterRound from "@/views/water/WaterRound.vue";
import RoundList from "@/components/water/RoundList.vue";
import { usePlantsStore } from "@/stores/plants";
import { useWateringStore } from "@/stores/watering";
import { useSessionStore } from "@/stores/session";

const DAY = 86_400_000;
const rec = (daysAgo: number) => ({ date_millis: Date.now() - daysAgo * DAY }) as WateringRecord;
const plant = (id: number, name: string) => ({ id, name, images: [] }) as unknown as Plant;

type Vm = { save(): Promise<void>; saveLabel: string };

const mountRound = ({ guest = false } = {}) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const plants = usePlantsStore(pinia);
  const watering = useWateringStore(pinia);
  const session = useSessionStore(pinia);
  const overridable = (store: object) => store as unknown as Record<string, unknown>;
  overridable(plants).personalPlants = [plant(1, "Fine"), plant(2, "Thirsty"), plant(3, "Parched")];
  watering.byPlantId = {
    1: [rec(1), rec(8)],
    2: [rec(20), rec(27)],
    3: [rec(30), rec(44)],
  };
  watering.fertilizerTypes = [{ id: 4, name: "Bloom" } as FertilizerType];
  overridable(session).isGuest = guest;
  vi.mocked(watering.addBatch).mockResolvedValue([11, 12]);
  const wrapper = shallowMount(WaterRound, {
    global: { plugins: [pinia], renderStubDefaultSlot: true },
  });
  return { wrapper, watering, vm: wrapper.vm as unknown as Vm };
};

describe("WaterRound", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-ticks the thirsty plants and shows their count on the button", async () => {
    const { wrapper } = mountRound();
    await flushPromises();
    expect(wrapper.find(".log-button").text()).toContain('"count":2');
    const list = wrapper.findComponent(RoundList);
    const names = (list.props("rows") as { name: string; checked: boolean }[]).map(
      (row) => `${row.name}:${row.checked}`,
    );
    expect(names.sort()).toEqual(["Fine:false", "Parched:true", "Thirsty:true"]);
  });

  it("loads plants, fertilizer types and records on creation", async () => {
    const { watering } = mountRound();
    await flushPromises();
    expect(watering.ensureFertilizerTypes).toHaveBeenCalled();
    expect(watering.ensureRecordsFor).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("logs the ticked plants with the round fertilizer on save", async () => {
    const { wrapper, watering, vm } = mountRound();
    await flushPromises();
    wrapper.findComponent(RoundList).vm.$emit("toggle", 1);
    wrapper.findComponent(RoundList).vm.$emit("set-fertilizer", 2, null);
    await flushPromises();
    await wrapper.find(".log-button").trigger("click");
    await flushPromises();
    const entries = vi.mocked(watering.addBatch).mock.calls[0][0];
    expect(entries).toHaveLength(3);
    expect(entries).toEqual(
      expect.arrayContaining([
        { plantId: 1, usedFertilizer: false, fertilizerTypeId: null },
        { plantId: 2, usedFertilizer: false, fertilizerTypeId: null },
        { plantId: 3, usedFertilizer: false, fertilizerTypeId: null },
      ]),
    );
    expect(vm.saveLabel).toContain("water.log_count");
  });

  it("sends the chosen round fertilizer for rows that follow it", async () => {
    const { wrapper, watering } = mountRound();
    await flushPromises();
    wrapper.findComponent({ name: "IonSegment" }).vm.$emit("ionChange", { detail: { value: "4" } });
    await flushPromises();
    await wrapper.find(".log-button").trigger("click");
    await flushPromises();
    expect(vi.mocked(watering.addBatch).mock.calls[0][0]).toEqual(
      expect.arrayContaining([{ plantId: 3, usedFertilizer: true, fertilizerTypeId: 4 }]),
    );
  });

  it("offers an undo that removes exactly the logged records", async () => {
    const { wrapper, watering } = mountRound();
    await flushPromises();
    await wrapper.find(".log-button").trigger("click");
    await flushPromises();
    expect(toast.showToastWithAction).toHaveBeenCalledTimes(1);
    const [message, , handler] = toast.showToastWithAction.mock.calls[0];
    expect(message).toEqual({ key: "water.round_logged", vars: { count: 2 } });
    await handler();
    await flushPromises();
    expect(watering.removeBatch).toHaveBeenCalledWith([11, 12], expect.arrayContaining([2, 3]));
    expect(toast.showSuccess).toHaveBeenCalledWith({ key: "plantdetail.undone" });
  });

  it("does not save an empty selection", async () => {
    const { wrapper, watering, vm } = mountRound();
    await flushPromises();
    wrapper.findComponent(RoundList).vm.$emit("toggle", 2);
    wrapper.findComponent(RoundList).vm.$emit("toggle", 3);
    await flushPromises();
    await vm.save();
    expect(watering.addBatch).not.toHaveBeenCalled();
  });

  it("hides the footer and snap slot for guests", async () => {
    const { wrapper } = mountRound({ guest: true });
    await flushPromises();
    expect(wrapper.find(".log-button").exists()).toBe(false);
    expect(wrapper.find(".snap-slot").exists()).toBe(false);
  });

  it("shows the footer and snap slot for signed in users", async () => {
    const { wrapper } = mountRound();
    await flushPromises();
    expect(wrapper.find(".snap-slot").exists()).toBe(true);
  });
  it("still shows the success toast with undo when refreshing the records fails", async () => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false });
    const plants = usePlantsStore(pinia);
    const watering = useWateringStore(pinia);
    const overridable = (store: object) => store as unknown as Record<string, unknown>;
    vi.spyOn(plants, "ensureLoaded").mockResolvedValue();
    vi.spyOn(watering, "ensureRecordsFor").mockResolvedValue();
    vi.spyOn(watering, "ensureFertilizerTypes").mockResolvedValue();
    overridable(plants).personalPlants = [plant(2, "Thirsty")];
    watering.byPlantId = { 2: [rec(20), rec(27)] };
    api.post.mockResolvedValue({ ids: [31] });
    api.get.mockRejectedValue(new Error("offline"));
    const wrapper = shallowMount(WaterRound, {
      global: { plugins: [pinia], renderStubDefaultSlot: true },
    });
    await flushPromises();

    await wrapper.find(".log-button").trigger("click");
    await flushPromises();

    expect(toast.showToastWithAction).toHaveBeenCalledTimes(1);
    expect(toast.showToastWithAction.mock.calls[0][0]).toEqual({
      key: "water.round_logged",
      vars: { count: 1 },
    });
  });
});
