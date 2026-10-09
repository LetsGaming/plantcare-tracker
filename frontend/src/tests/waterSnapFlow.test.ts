import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

vi.mock("@/services/general/ToastService", () => ({
  default: { showSuccess: vi.fn(), showError: vi.fn(), showToastWithAction: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));

const recognition = vi.hoisted(() => ({
  status: vi.fn(),
  match: vi.fn(),
  confirm: vi.fn(),
}));
vi.mock("@/services/RecognitionService", () => ({ default: recognition }));
const images = vi.hoisted(() => ({ deleteImage: vi.fn() }));
vi.mock("@/services/ImageService", () => ({ default: images }));

import WaterRound from "@/views/water/WaterRound.vue";
import SnapButton from "@/components/water/SnapButton.vue";
import SnapMatchSheet from "@/components/water/SnapMatchSheet.vue";
import PlantPickerModal from "@/components/water/PlantPickerModal.vue";
import { usePlantsStore } from "@/stores/plants";
import { useWateringStore } from "@/stores/watering";
import { useSessionStore } from "@/stores/session";
import { useSnapSettingsStore } from "@/stores/snapSettings";
import ToastService from "@/services/general/ToastService";

const DAY = 86_400_000;
const rec = (daysAgo: number) => ({ date_millis: Date.now() - daysAgo * DAY }) as WateringRecord;
const plant = (id: number, name: string) => ({ id, name, images: [] }) as unknown as Plant;

type Vm = {
  onPhoto(file: File): Promise<void>;
  onPick(plantId: number): Promise<void>;
  onFertilize(typeId: number): Promise<void>;
  onUndo(): Promise<void>;
};

const photo = () => new File(["x"], "p.jpg", { type: "image/jpeg" });

const mountRound = async ({ guest = false, keepPhoto = true } = {}) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const plants = usePlantsStore(pinia);
  const watering = useWateringStore(pinia);
  const overridable = (store: object) => store as unknown as Record<string, unknown>;
  overridable(plants).personalPlants = [plant(1, "Fine"), plant(2, "Thirsty"), plant(3, "Parched")];
  watering.byPlantId = { 1: [rec(1), rec(8)], 2: [rec(20), rec(27)], 3: [rec(30), rec(44)] };
  watering.fertilizerTypes = [{ id: 4, name: "Bloom" } as FertilizerType];
  overridable(useSessionStore(pinia)).isGuest = guest;
  useSnapSettingsStore(pinia).keepPhoto = keepPhoto;
  const wrapper = shallowMount(WaterRound, {
    global: { plugins: [pinia], renderStubDefaultSlot: true },
  });
  await flushPromises();
  return { wrapper, plants, watering, vm: wrapper.vm as unknown as Vm };
};

const sheetProps = (wrapper: ReturnType<typeof shallowMount>) =>
  wrapper.findComponent(SnapMatchSheet).props() as InstanceType<typeof SnapMatchSheet>["$props"];

describe("WaterRound snap flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recognition.status.mockResolvedValue(true);
    recognition.match.mockResolvedValue({
      snapshotId: "snap1",
      threshold: 0.8,
      candidates: [
        { plantId: 1, score: 0.9 },
        { plantId: 3, score: 0.86 },
      ],
    });
    recognition.confirm.mockResolvedValue({ recordId: 55, imageId: 66 });
  });

  it("hides the snap button when recognition is unavailable", async () => {
    recognition.status.mockResolvedValue(false);
    const { wrapper } = await mountRound();
    expect(wrapper.findComponent(SnapButton).exists()).toBe(false);
  });

  it("hides the snap button for guests", async () => {
    const { wrapper } = await mountRound({ guest: true });
    expect(wrapper.findComponent(SnapButton).exists()).toBe(false);
  });

  it("shows the snap button when recognition is available", async () => {
    const { wrapper } = await mountRound();
    expect(wrapper.findComponent(SnapButton).exists()).toBe(true);
  });

  it("matches a photo and offers reranked candidates with the confidence flag", async () => {
    const { wrapper } = await mountRound();
    const file = photo();
    wrapper.findComponent(SnapButton).vm.$emit("photo", file);
    await flushPromises();
    expect(recognition.match).toHaveBeenCalledWith(file);
    const props = sheetProps(wrapper);
    expect(props.isOpen).toBe(true);
    expect(props.state).toBe("candidates");
    expect(props.confident).toBe(true);
    expect(props.candidates?.map((c: { plantId: number }) => c.plantId)).toEqual([3, 1]);
    expect(props.candidates?.[0]).toMatchObject({ name: "Parched", tone: "overdue" });
  });

  it("flags a weak best match as not confident", async () => {
    recognition.match.mockResolvedValue({
      snapshotId: "s",
      threshold: 0.8,
      candidates: [{ plantId: 1, score: 0.4 }],
    });
    const { wrapper, vm } = await mountRound();
    await vm.onPhoto(photo());
    expect(sheetProps(wrapper).confident).toBe(false);
  });

  it("closes the sheet when matching fails", async () => {
    recognition.match.mockRejectedValue(new Error("busy"));
    const { wrapper, vm } = await mountRound();
    await vm.onPhoto(photo());
    expect(sheetProps(wrapper).isOpen).toBe(false);
  });

  it("ignores a match result that arrives after the sheet was dismissed", async () => {
    let resolve!: (value: unknown) => void;
    recognition.match.mockReturnValue(new Promise((r) => (resolve = r)));
    const { wrapper, vm } = await mountRound();
    const pending = vm.onPhoto(photo());
    wrapper.findComponent(SnapMatchSheet).vm.$emit("close");
    resolve({ snapshotId: "late", threshold: 0.8, candidates: [{ plantId: 1, score: 0.9 }] });
    await pending;
    expect(sheetProps(wrapper).isOpen).toBe(false);
    await vm.onPick(1);
    expect(recognition.confirm).not.toHaveBeenCalled();
  });

  it("confirms once with the keep photo setting and refreshes the plant", async () => {
    const { wrapper, plants, watering, vm } = await mountRound({ keepPhoto: false });
    await vm.onPhoto(photo());
    await vm.onPick(1);
    expect(recognition.confirm).toHaveBeenCalledTimes(1);
    expect(recognition.confirm).toHaveBeenCalledWith("snap1", { plantId: 1, keepPhoto: false });
    expect(watering.ensureRecords).toHaveBeenCalledWith(1, { force: true });
    expect(plants.getPlant).toHaveBeenCalledWith(1, true);
    expect(sheetProps(wrapper).state).toBe("logged");
    expect(sheetProps(wrapper).loggedName).toBe("Fine");
  });

  it("does not confirm twice when a pick is repeated while in flight", async () => {
    let resolve!: (value: unknown) => void;
    recognition.confirm.mockReturnValue(new Promise((r) => (resolve = r)));
    const { wrapper, vm } = await mountRound();
    await vm.onPhoto(photo());
    const first = vm.onPick(1);
    const second = vm.onPick(3);
    await nextTick();
    expect(sheetProps(wrapper).busy).toBe(true);
    resolve({ recordId: 1, imageId: null });
    await Promise.all([first, second]);
    expect(recognition.confirm).toHaveBeenCalledTimes(1);
    await vm.onPick(1);
    expect(recognition.confirm).toHaveBeenCalledTimes(1);
  });

  it("restarts from a new photo after a failed confirmation", async () => {
    recognition.confirm.mockRejectedValue(new Error("gone"));
    const { wrapper, vm } = await mountRound();
    await vm.onPhoto(photo());
    await vm.onPick(1);
    expect(sheetProps(wrapper).isOpen).toBe(false);
    expect(sheetProps(wrapper).busy).toBe(false);
    await vm.onPick(1);
    expect(recognition.confirm).toHaveBeenCalledTimes(1);
  });

  it("still shows the logged state when refreshing the plant fails", async () => {
    const { wrapper, plants, vm } = await mountRound();
    vi.mocked(plants.getPlant).mockRejectedValue(new Error("offline"));
    await vm.onPhoto(photo());
    await vm.onPick(1);
    expect(sheetProps(wrapper).state).toBe("logged");
  });

  it("opens the picker for other plants and confirms its pick", async () => {
    const { wrapper } = await mountRound();
    wrapper.findComponent(SnapButton).vm.$emit("photo", photo());
    await flushPromises();
    wrapper.findComponent(SnapMatchSheet).vm.$emit("other");
    await flushPromises();
    expect(wrapper.findComponent(PlantPickerModal).props("isOpen")).toBe(true);
    wrapper.findComponent(PlantPickerModal).vm.$emit("pick", 2);
    await flushPromises();
    expect(recognition.confirm).toHaveBeenCalledWith("snap1", { plantId: 2, keepPhoto: true });
    expect(wrapper.findComponent(PlantPickerModal).props("isOpen")).toBe(false);
  });

  it("adds fertilizer to the logged record", async () => {
    const { watering, vm } = await mountRound();
    await vm.onPhoto(photo());
    await vm.onPick(1);
    await vm.onFertilize(4);
    expect(watering.editRecord).toHaveBeenCalledWith(1, 55, {
      usedFertilizer: true,
      fertilizerTypeId: 4,
    });
  });

  it("undo deletes the record and the kept photo", async () => {
    const { wrapper, plants, watering, vm } = await mountRound();
    await vm.onPhoto(photo());
    await vm.onPick(1);
    vi.mocked(plants.getPlant).mockClear();
    await vm.onUndo();
    expect(watering.deleteRecord).toHaveBeenCalledWith(1, 55);
    expect(images.deleteImage).toHaveBeenCalledWith(66);
    expect(plants.getPlant).toHaveBeenCalledWith(1, true);
    expect(sheetProps(wrapper).isOpen).toBe(false);
  });

  it("undo skips the image delete when no photo was kept", async () => {
    recognition.confirm.mockResolvedValue({ recordId: 55, imageId: null });
    const { watering, vm } = await mountRound();
    await vm.onPhoto(photo());
    await vm.onPick(1);
    await vm.onUndo();
    expect(watering.deleteRecord).toHaveBeenCalledWith(1, 55);
    expect(images.deleteImage).not.toHaveBeenCalled();
  });

  it("reports an unsupported or oversized photo", async () => {
    const { wrapper } = await mountRound();
    wrapper.findComponent(SnapButton).vm.$emit("invalid", "type");
    expect(ToastService.showError).toHaveBeenCalledWith("water.snap_bad_type");
    wrapper.findComponent(SnapButton).vm.$emit("invalid", "size");
    expect(ToastService.showError).toHaveBeenCalledWith("water.snap_too_large");
  });
});
