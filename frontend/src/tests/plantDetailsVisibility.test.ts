import { describe, it, expect, vi, beforeEach } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

const session = vi.hoisted(() => ({ role: "user", userId: 1 }));

vi.mock("@/stores/session", () => ({
  useSessionStore: () => ({
    get isGuest() {
      return session.role === "guest";
    },
    get userId() {
      return session.userId;
    },
    get role() {
      return session.role;
    },
  }),
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

import PlantDetails from "@/views/plants/PlantDetails.vue";
import { usePlantsStore } from "@/stores/plants";

const mountDetails = (plantOwnerId: number) => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = usePlantsStore(pinia);
  store.mine.items = [
    {
      id: 5,
      userId: plantOwnerId,
      name: "Monty",
      isPublic: true,
      speciesName: null,
      cover: null,
      images: [],
    } as unknown as PlantView,
  ];
  return shallowMount(PlantDetails, {
    props: { id: "5" },
    global: { plugins: [pinia], renderStubDefaultSlot: true },
  });
};

describe("PlantDetails watering visibility", () => {
  beforeEach(() => {
    session.role = "user";
    session.userId = 1;
  });

  it("shows the status band and calendar to the owner", async () => {
    const wrapper = mountDetails(1);
    await flushPromises();
    expect(wrapper.findComponent({ name: "WateringStatus" }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: "WateringRecords" }).exists()).toBe(true);
    expect(wrapper.find(".history-private").exists()).toBe(false);
    expect((wrapper.vm as any).canEdit).toBe(true);
  });

  it("replaces them with a private note on another user's public plant", async () => {
    const wrapper = mountDetails(2);
    await flushPromises();
    expect(wrapper.findComponent({ name: "WateringStatus" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "WateringRecords" }).exists()).toBe(false);
    expect(wrapper.find(".history-private").text()).toContain("plantdetail.history_private");
    expect((wrapper.vm as any).canEdit).toBe(false);
  });

  it("tells the care guide when the page is hidden", async () => {
    const wrapper = mountDetails(1);
    await flushPromises();
    const guide = () => wrapper.findComponent({ name: "MoreInfo" });
    expect(guide().props("active")).toBe(true);
    (wrapper.vm as any).pageActive = false;
    await flushPromises();
    expect(guide().props("active")).toBe(false);
  });

  it("does the same for a guest", async () => {
    session.role = "guest";
    session.userId = 0;
    const wrapper = mountDetails(2);
    await flushPromises();
    expect(wrapper.findComponent({ name: "WateringStatus" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "WateringRecords" }).exists()).toBe(false);
    expect(wrapper.find(".history-private").text()).toContain("plantdetail.history_private");
    expect((wrapper.vm as any).canEdit).toBe(false);
  });
});
