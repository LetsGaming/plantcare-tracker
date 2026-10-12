/**
 * The plant overview on the summary contract: no watering history requests on
 * entry, status built from the summary on each owned plant, server search and
 * paging for the public segment, an inactive page that does not recompute, and
 * a session that ends while a load is in flight. The real store runs on a
 * mocked ApiUtils; ItemsOverview and SearchBar are real, Ionic is stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  apiPlantListItem,
  apiWateringSummary,
  createInstalledPinia,
  envelope,
  fakeJwt,
  resetStore,
} from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);
vi.mock("@/utils/apiUtils", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    isApiError: () => false,
    configureAuth: vi.fn(),
  },
}));
vi.mock("@/utils/wateringStats", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/wateringStats")>();
  return { ...original, wateringStatus: vi.fn(original.wateringStatus) };
});

import ApiUtils from "@/utils/apiUtils";
import { wateringStatus } from "@/utils/wateringStats";
import { epoch } from "@/stores/resource";
import { useSessionStore } from "@/stores/session";
import { usePlantsStore } from "@/stores/plants";
import PlantOverview from "@/views/plants/PlantOverview.vue";
import ItemsOverview, { type OverviewItem } from "@/components/overview/ItemsOverview.vue";
import OverviewCard from "@/components/overview/OverviewCard.vue";
import { SEARCH_DEBOUNCE_MS } from "@/components/SearchBar.vue";

const DAY = 24 * 60 * 60 * 1000;

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonSearchbarStub = defineComponent({
  emits: ["ionInput"],
  render() {
    return h("input", {
      onInput: (e: Event) =>
        this.$emit("ionInput", { detail: { value: (e.target as HTMLInputElement).value } }),
    });
  },
});

const InfiniteStub = defineComponent({
  name: "IonInfiniteScroll",
  props: { disabled: { type: Boolean, default: false } },
  emits: ["ionInfinite"],
  render() {
    return h("div", { class: "infinite" }, this.$slots.default?.());
  },
});

const stubs = {
  IonPage: passthrough(),
  IonButton: passthrough("button"),
  IonContent: passthrough(),
  IonRefresher: passthrough(),
  IonRefresherContent: true,
  IonFab: passthrough(),
  IonFabButton: passthrough("button"),
  IonIcon: true,
  IonInfiniteScroll: InfiniteStub,
  IonInfiniteScrollContent: true,
  IonSearchbar: IonSearchbarStub,
  IconButton: true,
  StateBlock: true,
  ProgressiveImage: true,
  OverviewHeader: true,
  PlantAddingModal: true,
};

const item = (id: number, overrides: Partial<APIPlantListItem> = {}): APIPlantListItem =>
  apiPlantListItem({
    plant_id: id,
    plant_name: `Plant ${String(id).padStart(3, "0")}`,
    user_id: 1,
    watering: apiWateringSummary(),
    cover: null,
    ...overrides,
  });

const foreign = (id: number): APIPlantListItem =>
  item(id, { user_id: 7, is_public: true, watering: null });

const page = (items: APIPlantListItem[], next: string | null = null, total?: number) =>
  envelope(items, next, total).data;

interface Routes {
  mine?: (params: URLSearchParams) => unknown;
  public?: (params: URLSearchParams) => unknown;
}

const route = (routes: Routes) =>
  vi.mocked(ApiUtils.get).mockImplementation((async (path: string) => {
    const url = new URL(path, "http://test");
    const handler = url.searchParams.get("scope") === "mine" ? routes.mine : routes.public;
    return handler?.(url.searchParams);
  }) as never);

const paths = (): URL[] =>
  vi.mocked(ApiUtils.get).mock.calls.map(([path]) => new URL(path as string, "http://test"));

const mountPage = async (
  routes: Routes,
  claims: Record<string, unknown> = { id: 1, username: "alice", role: "user" },
) => {
  const pinia = await createInstalledPinia();
  await useSessionStore(pinia).storeToken(fakeJwt(claims));
  route(routes);
  const wrapper = mount(PlantOverview, { global: { plugins: [pinia], stubs } });
  return { wrapper, store: usePlantsStore(pinia), vm: wrapper.vm as any };
};

const list = (wrapper: VueWrapper<any>) => wrapper.findComponent(ItemsOverview);
const shown = (wrapper: VueWrapper<any>) => list(wrapper).props("items") as readonly OverviewItem[];
const cards = (wrapper: VueWrapper<any>) => wrapper.findAllComponents(OverviewCard);

const leave = (vm: any) => vm.onIonViewDidLeave.forEach((hook: () => void) => hook());
const enter = (vm: any) => vm.onIonViewWillEnter.forEach((hook: () => void) => hook());

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(() => {
  resetStore();
  vi.mocked(ApiUtils.get).mockReset();
  vi.mocked(wateringStatus).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlantOverview entry", () => {
  it("makes no watering history request and shows the status from the summaries", async () => {
    const now = Date.now();
    const { wrapper, vm } = await mountPage({
      mine: () =>
        page([
          item(1, {
            watering: apiWateringSummary({
              last_watered_at: now - DAY,
              avg_interval_days: 7,
            }),
          }),
          item(2, {
            watering: apiWateringSummary({
              last_watered_at: now - 40 * DAY,
              avg_interval_days: 7,
            }),
          }),
          item(3),
        ]),
    });
    await vm.fetchPlants();
    await flushPromises();

    expect(paths().map((url) => url.pathname)).toEqual(["/plants"]);
    expect(paths().some((url) => url.pathname.startsWith("/watering"))).toBe(false);
    expect(shown(wrapper).map((card) => card.statusTone)).toEqual(["ok", "overdue", "new"]);
    expect(shown(wrapper)[2].statusLine).toBe("plantlist.never");
    wrapper.unmount();
  });

  it("shows no status for a plant of someone else and no 'never watered' for an unknown summary", async () => {
    const { wrapper, vm } = await mountPage({
      mine: () => page([item(1, { is_public: true })]),
      public: () => page([item(1, { is_public: true, watering: null }), foreign(9)]),
    });
    await vm.fetchPlants();
    vm.handleSegmentChange("public");
    await flushPromises();

    const [own, other] = shown(wrapper);
    expect(own.statusTone).toBe("new");
    expect(other.statusTone).toBeUndefined();
    expect(other.statusLine).toBeUndefined();
    wrapper.unmount();
  });

  it("passes the paging and search state of the segment to the list", async () => {
    const { wrapper, vm } = await mountPage({
      mine: () => page([item(1)]),
      public: () => page([foreign(5)], "next", 90),
    });
    await vm.fetchPlants();
    await flushPromises();
    expect(list(wrapper).props()).toMatchObject({
      serverSearch: false,
      hasMore: false,
      total: null,
      listKey: "private",
      active: true,
    });

    vm.handleSegmentChange("public");
    await flushPromises();
    expect(list(wrapper).props()).toMatchObject({
      serverSearch: true,
      hasMore: true,
      loadingMore: false,
      total: 90,
      listKey: "public",
    });
    wrapper.unmount();
  });

  it("keeps the card of an unchanged plant when another plant changes", async () => {
    const { wrapper, store, vm } = await mountPage({ mine: () => page([item(1), item(2)]) });
    await vm.fetchPlants();
    await flushPromises();
    const before = shown(wrapper);

    store.applySummaries(
      new Map([[2, { lastWateredAt: Date.now(), lastFertilizedAt: null, avgIntervalDays: null }]]),
    );
    await nextTick();

    const after = shown(wrapper);
    expect(after).not.toBe(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
    expect(after[1].statusTone).toBe("ok");
    wrapper.unmount();
  });
});

describe("PlantOverview public segment", () => {
  it("sends one debounced server search with the paging reset", async () => {
    const { wrapper, vm } = await mountPage({
      mine: () => page([item(1)]),
      public: (params) =>
        params.get("q") === "fern"
          ? page([foreign(5)], null, 1)
          : page([foreign(1), foreign(2)], "c1", 50),
    });
    await vm.fetchPlants();
    vm.handleSegmentChange("public");
    await flushPromises();
    const before = paths().length;

    const input = wrapper.find("input");
    await input.setValue("f");
    await input.setValue("fe");
    await input.setValue("fern");
    expect(paths()).toHaveLength(before);
    await wait(SEARCH_DEBOUNCE_MS + 60);
    await flushPromises();

    const searches = paths().slice(before);
    expect(searches).toHaveLength(1);
    expect(searches[0].searchParams.get("q")).toBe("fern");
    expect(searches[0].searchParams.get("scope")).toBe("public");
    expect(searches[0].searchParams.get("cursor")).toBeNull();
    expect(shown(wrapper).map((card) => card.id)).toEqual([5]);
    wrapper.unmount();
  });

  it("loads the next page when the list asks for more", async () => {
    const { wrapper, store, vm } = await mountPage({
      public: (params) =>
        params.get("cursor") === "c1" ? page([foreign(2)]) : page([foreign(1)], "c1", 2),
    });
    vm.handleSegmentChange("public");
    await flushPromises();

    list(wrapper).vm.$emit("load-more");
    await flushPromises();

    expect(paths().at(-1)!.searchParams.get("cursor")).toBe("c1");
    expect(store.publicPlants.map((plant) => plant.id)).toEqual([1, 2]);
    expect(list(wrapper).props("hasMore")).toBe(false);
    wrapper.unmount();
  });

  it("resets the card window when the segment changes", async () => {
    const many = (start: number) => Array.from({ length: 100 }, (_, i) => item(start + i));
    const { wrapper, vm } = await mountPage({
      mine: () => page(many(1)),
      public: () => page(many(1000).map((plant) => ({ ...plant, user_id: 7, watering: null }))),
    });
    await vm.fetchPlants();
    await flushPromises();
    expect(cards(wrapper)).toHaveLength(40);

    const complete = vi.fn();
    wrapper.findComponent(InfiniteStub).vm.$emit("ionInfinite", { target: { complete } });
    await flushPromises();
    expect(cards(wrapper)).toHaveLength(80);

    vm.handleSegmentChange("public");
    await flushPromises();
    expect(cards(wrapper)).toHaveLength(40);
    wrapper.unmount();
  });

  it("shows a guest the public plants only", async () => {
    const { wrapper, vm } = await mountPage(
      { public: () => page([foreign(3)]) },
      { id: 0, username: "guest", role: "guest" },
    );
    await vm.fetchPlants();
    vm.handleSegmentChange("public");
    await flushPromises();

    expect(paths().map((url) => url.searchParams.get("scope"))).toEqual(["public"]);
    expect(shown(wrapper).map((card) => card.id)).toEqual([3]);
    expect(vm.showRoundButton).toBe(false);
    wrapper.unmount();
  });
});

describe("PlantOverview lifecycle", () => {
  it("does not recompute while the page is hidden and recomputes once when it is shown again", async () => {
    const { wrapper, store, vm } = await mountPage({ mine: () => page([item(1), item(2)]) });
    await vm.fetchPlants();
    await flushPromises();
    const computed = vi.mocked(wateringStatus).mock.calls.length;
    const hiddenItems = shown(wrapper);

    leave(vm);
    await nextTick();
    store.applySummaries(
      new Map([
        [1, { lastWateredAt: Date.now(), lastFertilizedAt: null, avgIntervalDays: null }],
        [2, { lastWateredAt: Date.now(), lastFertilizedAt: null, avgIntervalDays: null }],
      ]),
    );
    await flushPromises();
    expect(vi.mocked(wateringStatus).mock.calls.length).toBe(computed);
    expect(shown(wrapper)).toBe(hiddenItems);
    expect(list(wrapper).props("active")).toBe(false);

    enter(vm);
    await flushPromises();
    expect(vi.mocked(wateringStatus).mock.calls.length).toBe(computed + 2);
    expect(shown(wrapper).map((card) => card.statusTone)).toEqual(["ok", "ok"]);
    expect(list(wrapper).props("active")).toBe(true);
    wrapper.unmount();
  });

  it("drops the result of a load that was in flight when the session ended", async () => {
    let release!: (value: unknown) => void;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const { wrapper, store, vm } = await mountPage({});
    vi.mocked(ApiUtils.get).mockReturnValue(gate as never);

    const loading = vm.fetchPlants();
    await vi.waitFor(() => expect(ApiUtils.get).toHaveBeenCalled());
    epoch.abortAll();
    release(page([item(1)]));
    await loading;
    await flushPromises();

    expect(store.personalPlants).toEqual([]);
    expect(shown(wrapper)).toEqual([]);
    wrapper.unmount();
  });
});
