/**
 * src/tests/viewReactivity.test.ts
 *
 * Tests for the event-driven view pattern: views subscribe to cache
 * events in mounted/beforeUnmount, re-derive their state through the
 * service getters on every event (no mutation calls, no refetch loops),
 * and detach the listener on unmount.
 *
 * All services are mocked — nothing here touches the network or Ionic
 * storage.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

// ── Hoisted service spies ────────────────────────────────────────────────────

const spies = vi.hoisted(() => ({
  // WateringService
  getWateringRecords: vi.fn(async (): Promise<unknown[]> => []),
  getFertilizerTypes: vi.fn(async (): Promise<unknown[]> => []),
  addWateringRecord: vi.fn(),
  editWateringRecord: vi.fn(),
  deleteWateringRecord: vi.fn(),
  // Substrate/Component/User/Calendar helpers used during mount
  getAllSubstrates: vi.fn(async (): Promise<unknown[]> => []),
  getWateringCategories: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@/services/WateringService", () => ({
  default: {
    getWateringRecords: spies.getWateringRecords,
    getFertilizerTypes: spies.getFertilizerTypes,
    addWateringRecord: spies.addWateringRecord,
    editWateringRecord: spies.editWateringRecord,
    deleteWateringRecord: spies.deleteWateringRecord,
  },
  WateringEvents: {
    RECORDS_CHANGED: "watering-records-changed",
    FERTILIZER_TYPES_CHANGED: "fertilizer-types-changed",
  },
}));

vi.mock("@/services/SubstrateService", () => ({
  default: { getAllSubstrates: spies.getAllSubstrates },
  SubstrateEvents: { SUBSTRATES_UPDATED: "substrates-updated" },
}));

vi.mock("@/stores/session", () => ({
  useSessionStore: () => ({ isGuest: false, userId: 1 }),
}));

vi.mock("@/services/CalendarService", () => ({
  default: { getWateringCategories: spies.getWateringCategories },
}));

vi.mock("@/services/general/ToastService", () => ({
  default: { showError: vi.fn(), showSuccess: vi.fn(), showWarning: vi.fn() },
}));

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key },
}));

import WateringRecords from "@/components/plants/watering/WateringRecords.vue";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import { usePlantsStore } from "@/stores/plants";

const record = (id: number, millis: number) => ({
  id,
  plantId: 1,
  plantName: "Monstera",
  date: new Date(millis).toISOString(),
  date_millis: millis,
  usedFertilizer: false,
});

beforeEach(() => {
  Object.values(spies).forEach((s) => s.mockClear());
  spies.getWateringRecords.mockResolvedValue([]);
});

// ── WateringRecords component ────────────────────────────────────────────────

describe("WateringRecords — event-driven re-derivation", () => {
  it("re-derives from the getter on RECORDS_CHANGED without calling mutations", async () => {
    spies.getWateringRecords.mockResolvedValue([record(1, 1_700_000_000_000)]);

    const wrapper = shallowMount(WateringRecords, {
      props: { plantId: 1 },
    });
    await flushPromises();

    // mounted() loaded once through the getter
    expect(spies.getWateringRecords).toHaveBeenCalledTimes(1);
    expect(spies.getWateringRecords).toHaveBeenCalledWith(1);
    expect((wrapper.vm as any).records).toHaveLength(1);

    // A service paint (optimistic add elsewhere) fires the event…
    spies.getWateringRecords.mockResolvedValue([
      record(1, 1_700_000_000_000),
      record(-5, Date.now()),
    ]);
    document.dispatchEvent(new CustomEvent("watering-records-changed"));
    await flushPromises();

    // …and the component re-derives via the getter only.
    expect(spies.getWateringRecords).toHaveBeenCalledTimes(2);
    expect((wrapper.vm as any).records).toHaveLength(2);
    expect(spies.addWateringRecord).not.toHaveBeenCalled();
    expect(spies.editWateringRecord).not.toHaveBeenCalled();
    expect(spies.deleteWateringRecord).not.toHaveBeenCalled();

    // Listener is removed on unmount — further events are ignored.
    wrapper.unmount();
    document.dispatchEvent(new CustomEvent("watering-records-changed"));
    await flushPromises();
    expect(spies.getWateringRecords).toHaveBeenCalledTimes(2);
  });

  it("closes the add modal immediately and lets the event repaint (optimistic)", async () => {
    const wrapper = shallowMount(WateringRecords, {
      props: { plantId: 1 },
    });
    await flushPromises();

    let resolveAdd!: (value: unknown) => void;
    spies.addWateringRecord.mockReturnValue(
      new Promise((res) => {
        resolveAdd = res;
      }),
    );

    (wrapper.vm as any).showAddingModal = true;
    const pending = (wrapper.vm as any).addRecord({
      date: undefined,
      usedFertilizer: false,
      fertilizerTypeId: -1,
    });
    await flushPromises();

    // Modal is closed before the request settles — the optimistic paint
    // has already updated the calendar through RECORDS_CHANGED.
    expect((wrapper.vm as any).showAddingModal).toBe(false);
    expect(spies.addWateringRecord).toHaveBeenCalledTimes(1);

    resolveAdd(record(15, Date.now()));
    await pending;
    wrapper.unmount();
  });
});

// ── PlantOverview view ───────────────────────────────────────────────────────

const mountOverview = () => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const wrapper = shallowMount(PlantOverview, { global: { plugins: [pinia] } });
  return { wrapper, store: usePlantsStore(pinia) };
};

const plant = (id: number, userId: number, isPublic: boolean) =>
  ({ id, userId, name: `plant ${id}`, isPublic }) as Plant;

describe("PlantOverview: store-driven lists", () => {
  it("shows the active segment's plants and repaints when the store changes", async () => {
    const { wrapper, store } = mountOverview();
    await flushPromises();
    expect((wrapper.vm as any).plants).toEqual([]);

    store.items = [plant(1, 1, false), plant(2, 1, true), plant(3, 9, true)];
    await flushPromises();
    expect((wrapper.vm as any).plants.map((p: Plant) => p.id)).toEqual([1, 2]);

    // an optimistic paint elsewhere shows up without any event or refetch
    store.items.push(plant(-100, 1, false));
    await flushPromises();
    expect((wrapper.vm as any).plants.map((p: Plant) => p.id)).toEqual([1, 2, -100]);

    (wrapper.vm as any).handleSegmentChange("public");
    await flushPromises();
    expect((wrapper.vm as any).plants.map((p: Plant) => p.id)).toEqual([2, 3]);
    wrapper.unmount();
  });

  it("uses the reconciled plant id for the dependent image upload", async () => {
    const { wrapper, store } = mountOverview();
    await flushPromises();
    vi.mocked(store.addPlant).mockResolvedValue({ id: 7, name: "Monstera" } as Plant);

    const image = new File(["x"], "img.jpg", { type: "image/jpeg" });
    await (wrapper.vm as any).addPlant({
      name: "Monstera",
      species: "Monstera deliciosa",
      substrateId: 1,
      image,
    });
    await flushPromises();

    // The upload received the SERVER id from the reconciled plant,
    // never a raw snake_case field off the response.
    expect(store.uploadPlantImage).toHaveBeenCalledWith(7, image);
    wrapper.unmount();
  });
});
