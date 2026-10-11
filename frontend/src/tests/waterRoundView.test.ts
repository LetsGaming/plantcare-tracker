import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

const toast = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showToastWithAction: vi.fn(),
  dismissAllToasts: vi.fn(),
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
import SearchBar from "@/components/SearchBar.vue";
import SnapButton from "@/components/water/SnapButton.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { usePlantsStore } from "@/stores/plants";
import { useWateringStore } from "@/stores/watering";
import { useSessionStore } from "@/stores/session";
import { UNDO_TOAST_MS } from "@/utils/undo";

const DAY = 86_400_000;
const rec = (daysAgo: number) => ({ date_millis: Date.now() - daysAgo * DAY }) as WateringRecord;
const plant = (id: number, name: string) => ({ id, name, images: [] }) as unknown as Plant;

type Vm = { save(): Promise<void>; saveLabel: string };

const push = vi.fn();

const mountRound = ({
  guest = false,
  plantList = [plant(1, "Fine"), plant(2, "Thirsty"), plant(3, "Parched")],
  prepare,
}: {
  guest?: boolean;
  plantList?: Plant[];
  prepare?: (watering: ReturnType<typeof useWateringStore>) => void;
} = {}) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const plants = usePlantsStore(pinia);
  const watering = useWateringStore(pinia);
  const session = useSessionStore(pinia);
  const overridable = (store: object) => store as unknown as Record<string, unknown>;
  overridable(plants).personalPlants = plantList;
  watering.byPlantId = {
    1: [rec(1), rec(8)],
    2: [rec(20), rec(27)],
    3: [rec(30), rec(44)],
  };
  watering.fertilizerTypes = [{ id: 4, name: "Bloom" } as FertilizerType];
  overridable(session).isGuest = guest;
  vi.mocked(watering.addBatch).mockResolvedValue([11, 12]);
  prepare?.(watering);
  const wrapper = shallowMount(WaterRound, {
    global: { plugins: [pinia], renderStubDefaultSlot: true, mocks: { $router: { push } } },
  });
  return { wrapper, watering, session, vm: wrapper.vm as unknown as Vm };
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
    const [message, , handler, duration] = toast.showToastWithAction.mock.calls[0];
    expect(message).toEqual({ key: "water.round_logged", vars: { count: 2 } });
    expect(duration).toBe(0);
    expect(duration).not.toBe(UNDO_TOAST_MS);
    await handler();
    await flushPromises();
    expect(watering.removeBatch).toHaveBeenCalledWith([11, 12], expect.arrayContaining([2, 3]));
    expect(toast.showSuccess).toHaveBeenCalledWith({ key: "plantdetail.undone" });
  });

  describe("last round row", () => {
    const FIVE_MINUTES = 5 * 60 * 1000;
    const settle = () => vi.advanceTimersByTimeAsync(0);
    const saveRound = async (wrapper: ReturnType<typeof mountRound>["wrapper"]) => {
      await wrapper.find(".log-button").trigger("click");
      await settle();
    };

    afterEach(() => vi.useRealTimers());

    it("shows the count after saving and is absent before", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      expect(wrapper.find(".last-round").exists()).toBe(false);
      await wrapper.find(".log-button").trigger("click");
      await flushPromises();
      const row = wrapper.find(".last-round");
      expect(row.exists()).toBe(true);
      expect(row.attributes("role")).toBe("status");
      expect(row.text()).toContain('"count":2');
      expect(row.text()).toContain("plantdetail.undo");
    });

    it("undoes the same records as the toast and then disappears", async () => {
      const { wrapper, watering } = mountRound();
      await flushPromises();
      await wrapper.find(".log-button").trigger("click");
      await flushPromises();
      await wrapper.find(".last-round-undo").trigger("click");
      await flushPromises();
      expect(watering.removeBatch).toHaveBeenCalledTimes(1);
      expect(watering.removeBatch).toHaveBeenCalledWith([11, 12], expect.arrayContaining([2, 3]));
      expect(toast.dismissAllToasts).toHaveBeenCalled();
      expect(toast.showSuccess).toHaveBeenCalledWith({ key: "plantdetail.undone" });
      expect(wrapper.find(".last-round").exists()).toBe(false);
    });

    it("hides the row when the toast undo is used", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      await wrapper.find(".log-button").trigger("click");
      await flushPromises();
      await toast.showToastWithAction.mock.calls[0][2]();
      await flushPromises();
      expect(wrapper.find(".last-round").exists()).toBe(false);
    });

    it("keeps the row when the undo request fails", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { wrapper, watering } = mountRound();
      await flushPromises();
      await wrapper.find(".log-button").trigger("click");
      await flushPromises();
      vi.mocked(watering.removeBatch).mockRejectedValueOnce(new Error("offline"));
      await wrapper.find(".last-round-undo").trigger("click");
      await flushPromises();
      expect(wrapper.find(".last-round").exists()).toBe(true);
      expect(toast.showSuccess).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it("removes the row by itself after five minutes", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      vi.useFakeTimers();
      await saveRound(wrapper);
      expect(wrapper.find(".last-round").exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 1);
      expect(wrapper.find(".last-round").exists()).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(wrapper.find(".last-round").exists()).toBe(false);
    });

    it("shows only the newer round and restarts the timer", async () => {
      const { wrapper, watering } = mountRound();
      await flushPromises();
      vi.useFakeTimers();
      await saveRound(wrapper);
      await vi.advanceTimersByTimeAsync(FIVE_MINUTES - 1000);
      vi.mocked(watering.addBatch).mockResolvedValue([21, 22, 23]);
      await saveRound(wrapper);
      expect(wrapper.findAll(".last-round")).toHaveLength(1);
      expect(wrapper.find(".last-round").text()).toContain('"count":3');
      await vi.advanceTimersByTimeAsync(2000);
      expect(wrapper.find(".last-round").exists()).toBe(true);
      await wrapper.find(".last-round-undo").trigger("click");
      await settle();
      expect(watering.removeBatch).toHaveBeenCalledWith([21, 22, 23], expect.any(Array));
      expect(vi.getTimerCount()).toBe(0);
    });

    it("leaves no timer behind after unmount", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      vi.useFakeTimers();
      await saveRound(wrapper);
      expect(vi.getTimerCount()).toBe(1);
      wrapper.unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
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

  it("replaces the controls and the footer with a sign in prompt for guests", async () => {
    const { wrapper, session } = mountRound({ guest: true });
    await flushPromises();
    expect(wrapper.find(".log-button").exists()).toBe(false);
    expect(wrapper.findComponent(SnapButton).exists()).toBe(false);
    expect(wrapper.findComponent(SearchBar).exists()).toBe(false);
    expect(wrapper.findComponent(RoundList).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "IonSegment" }).exists()).toBe(false);
    const block = wrapper.findComponent(StateBlock);
    expect(block.props("message")).toBe("state.guest_hint");
    expect(block.props("actionLabel")).toBe("water.guest_cta");
    block.vm.$emit("action");
    expect(session.logout).toHaveBeenCalledTimes(1);
  });

  describe("screen states", () => {
    it("shows the loading state instead of the list while the round loads", async () => {
      const { wrapper } = mountRound({
        prepare: (watering) =>
          vi.mocked(watering.ensureRecordsFor).mockReturnValue(new Promise(() => {})),
      });
      await flushPromises();
      expect(wrapper.findComponent(StateBlock).props("kind")).toBe("loading");
      expect(wrapper.findComponent(RoundList).exists()).toBe(false);
    });

    it("shows an error with a retry that loads again and recovers", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { wrapper, watering } = mountRound({
        prepare: (w) => vi.mocked(w.ensureRecordsFor).mockRejectedValueOnce(new Error("offline")),
      });
      await flushPromises();
      const block = wrapper.findComponent(StateBlock);
      expect(block.props("kind")).toBe("error");
      expect(block.props("message")).toBe("water.load_error");
      expect(block.props("actionLabel")).toBe("state.retry");
      expect(wrapper.findComponent(RoundList).exists()).toBe(false);

      block.vm.$emit("action");
      await flushPromises();
      expect(watering.ensureRecordsFor).toHaveBeenCalledTimes(2);
      expect(wrapper.findComponent(StateBlock).exists()).toBe(false);
      expect(wrapper.findComponent(RoundList).exists()).toBe(true);
      spy.mockRestore();
    });

    it("sends an empty plant list to the Plants tab", async () => {
      const { wrapper } = mountRound({ plantList: [] });
      await flushPromises();
      const block = wrapper.findComponent(StateBlock);
      expect(block.props("kind")).toBe("empty");
      expect(block.props("message")).toBe("water.empty");
      expect(block.props("actionLabel")).toBe("water.empty_cta");
      block.vm.$emit("action");
      expect(push).toHaveBeenCalledWith("/tabs/plants");
    });
  });

  describe("search", () => {
    const search = async (wrapper: ReturnType<typeof mountRound>["wrapper"], value: string) => {
      wrapper.findComponent(SearchBar).vm.$emit("search", value);
      await flushPromises();
    };
    const visibleNames = (wrapper: ReturnType<typeof mountRound>["wrapper"]) =>
      (wrapper.findComponent(RoundList).props("rows") as { name: string }[]).map((r) => r.name);

    it("tells how many ticked plants a search hides, and still logs them", async () => {
      const { wrapper, watering } = mountRound();
      await flushPromises();
      expect(wrapper.find(".hidden-ticked").exists()).toBe(false);

      await search(wrapper, "fine");
      expect(visibleNames(wrapper)).toEqual(["Fine"]);
      expect(wrapper.find(".hidden-ticked").text()).toContain('"hidden":2');

      await wrapper.find(".log-button").trigger("click");
      await flushPromises();
      expect(watering.addBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ plantId: 2 }),
          expect.objectContaining({ plantId: 3 }),
        ]),
      );
    });

    it("counts only the ticked plants a search hides and clears with the search", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      await search(wrapper, "thirsty");
      expect(wrapper.find(".hidden-ticked").exists()).toBe(true);
      await search(wrapper, "");
      expect(wrapper.find(".hidden-ticked").exists()).toBe(false);
    });

    it("shows an empty state when nothing matches", async () => {
      const { wrapper } = mountRound();
      await flushPromises();
      await search(wrapper, "zzz");
      expect(wrapper.find(".empty-search").text()).toBe("water.no_match");
      expect(wrapper.findComponent(RoundList).exists()).toBe(false);
      await search(wrapper, "");
      expect(wrapper.find(".empty-search").exists()).toBe(false);
    });
  });

  it("places the snap button in the footer row next to the log button", async () => {
    const { wrapper } = mountRound();
    await flushPromises();
    const snap = wrapper.findComponent(SnapButton);
    expect(snap.exists()).toBe(true);
    expect(snap.props("fill")).toBe("outline");
    const row = wrapper.find(".footer-actions .action-row");
    expect(row.findComponent(SnapButton).exists()).toBe(true);
    expect(row.find(".log-button").exists()).toBe(true);
    const html = row.html();
    expect(html.indexOf("snap-button")).toBeLessThan(html.indexOf("log-button"));
    expect(wrapper.find(".round").findComponent(SnapButton).exists()).toBe(false);
  });

  it("hides the snap button when there is no plant to snap", async () => {
    const { wrapper } = mountRound({ plantList: [] });
    await flushPromises();
    expect(wrapper.findComponent(SnapButton).exists()).toBe(false);
  });

  it("names the round fertilizer segments in the app language", async () => {
    const { wrapper, watering } = mountRound();
    watering.fertilizerTypes = [{ id: 4, name: "organic" } as FertilizerType];
    await flushPromises();
    expect(wrapper.find(".round-fertilizer").text()).toContain("copy2.fertilizer.organic");
  });

  it("tags each round fertilizer segment with its kind and leaves none untagged", async () => {
    const { wrapper, watering } = mountRound();
    watering.fertilizerTypes = [
      { id: 1, name: "organic" },
      { id: 2, name: "synthetic" },
    ] as FertilizerType[];
    await flushPromises();
    const buttons = wrapper.findAllComponents({ name: "IonSegmentButton" });
    expect(buttons.map((b) => [b.attributes("value"), b.attributes("data-kind")])).toEqual([
      ["none", undefined],
      ["1", "organic"],
      ["2", "mineral"],
    ]);
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
