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

import { describe, it, expect, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/stores/session", () => ({
  useSessionStore: () => ({ isGuest: false, userId: 1 }),
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
  default: { t: (key: string) => key },
}));

import WateringRecords from "@/components/plants/watering/WateringRecords.vue";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import { usePlantsStore } from "@/stores/plants";
import { useWateringStore } from "@/stores/watering";

const record = (id: number, millis: number) => ({
  id,
  plantId: 1,
  plantName: "Monstera",
  date: new Date(millis).toISOString(),
  date_millis: millis,
  usedFertilizer: false,
});

// ── WateringRecords component ────────────────────────────────────────────────

const mountRecords = (records: unknown[] = []) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = useWateringStore(pinia);
  store.byPlantId = { 1: records as WateringRecord[] };
  const wrapper = shallowMount(WateringRecords, {
    props: { plantId: 1 },
    global: { plugins: [pinia] },
  });
  return { wrapper, store };
};

describe("WateringRecords: store-driven records", () => {
  it("loads through the store on mount and repaints when the store changes", async () => {
    const { wrapper, store } = mountRecords([record(1, 1_700_000_000_000)]);
    await flushPromises();

    expect(store.ensureRecords).toHaveBeenCalledWith(1);
    expect(store.ensureFertilizerTypes).toHaveBeenCalled();
    expect((wrapper.vm as any).records).toHaveLength(1);

    // an optimistic paint elsewhere shows up without any event
    store.byPlantId[1].push(record(-5, Date.now()) as WateringRecord);
    await flushPromises();
    expect((wrapper.vm as any).records).toHaveLength(2);
    expect(store.addRecord).not.toHaveBeenCalled();
    expect(store.editRecord).not.toHaveBeenCalled();
    expect(store.deleteRecord).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("offers no fertilizer first, then the fertilizer types from the store", async () => {
    const { wrapper, store } = mountRecords([record(1, Date.now() - 2 * 86_400_000)]);
    store.fertilizerTypes = [{ id: 2, name: "synthetic" }] as FertilizerType[];
    await flushPromises();
    expect((wrapper.vm as any).fertilizerOptions.map((o: { value: number }) => o.value)).toEqual([
      -1, 2,
    ]);
    wrapper.unmount();
  });

  it("keeps the form open and pending until the request settles, then closes it", async () => {
    const { wrapper, store } = mountRecords();
    await flushPromises();

    let resolveAdd!: (value: unknown) => void;
    vi.mocked(store.addRecord).mockReturnValue(
      new Promise((res) => {
        resolveAdd = res;
      }) as never,
    );

    (wrapper.vm as any).openAdd();
    const pending = (wrapper.vm as any).submitDraft({ date: 1_700_000_000_000 });
    await flushPromises();

    expect((wrapper.vm as any).showModal).toBe(true);
    expect((wrapper.vm as any).isSaving).toBe(true);
    expect(store.addRecord).toHaveBeenCalledWith(1, {
      date: 1_700_000_000_000,
      usedFertilizer: false,
      fertilizerTypeId: undefined,
    });

    resolveAdd(record(15, Date.now()));
    await pending;
    expect((wrapper.vm as any).showModal).toBe(false);
    expect((wrapper.vm as any).isSaving).toBe(false);
    wrapper.unmount();
  });

  it("keeps the form open with the draft when saving fails", async () => {
    const { wrapper, store } = mountRecords();
    await flushPromises();
    vi.mocked(store.addRecord).mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    (wrapper.vm as any).openAdd();
    await (wrapper.vm as any).submitDraft({ date: 1_700_000_000_000 });

    expect((wrapper.vm as any).showModal).toBe(true);
    expect((wrapper.vm as any).isSaving).toBe(false);
    wrapper.unmount();
  });

  it("maps records to local day keys and fertilizer markers", async () => {
    const day = new Date(2026, 4, 3, 23, 30).getTime();
    const { wrapper } = mountRecords([
      { ...record(1, day), usedFertilizer: false },
      { ...record(2, day + 86_400_000), usedFertilizer: true, fertilizerTypeId: 2 },
    ]);
    await flushPromises();
    expect(
      (wrapper.vm as any).mappedRecords.map((d: CalendarDates) => [d.date, d.category.name]),
    ).toEqual([
      ["2026-05-03", "watering.category.no_fertilizer"],
      ["2026-05-04", "watering.category.organic"],
    ]);
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
