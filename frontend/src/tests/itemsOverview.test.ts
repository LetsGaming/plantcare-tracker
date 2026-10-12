import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import ItemsOverview, {
  WINDOW_STEP,
  type OverviewItem,
} from "@/components/overview/ItemsOverview.vue";
import OverviewCard from "@/components/overview/OverviewCard.vue";
import ItemsGrid from "@/components/overview/ItemsGrid.vue";
import SearchBar, { SEARCH_DEBOUNCE_MS } from "@/components/SearchBar.vue";
import { isActive, pageActive } from "@/utils/pageActive";

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

const StateBlockStub = defineComponent({
  props: { kind: { type: String, default: "" } },
  render() {
    return h("div", { class: "state-block", "data-kind": this.kind });
  },
});

const stubs = {
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
  StateBlock: StateBlockStub,
  ProgressiveImage: true,
};

let updates: Record<string, number> = {};
const countUpdates = {
  updated(this: { $options: { name?: string } }) {
    const name = this.$options.name;
    if (name) updates[name] = (updates[name] ?? 0) + 1;
  },
};

const plants = (count: number): OverviewItem[] =>
  Array.from({ length: count }, (_, i) =>
    Object.freeze({ id: i + 1, name: `Plant ${String(i + 1).padStart(4, "0")}` }),
  );

const handlers = { onItemClick: vi.fn(), onRefreshItems: vi.fn(async () => {}) };

const mountOverview = (props: Record<string, unknown>) =>
  mount(ItemsOverview, {
    props: { ...handlers, ...props } as any,
    global: { stubs, mixins: [countUpdates] },
  });

const cards = (wrapper: VueWrapper<any>) => wrapper.findAllComponents(OverviewCard);
const names = (wrapper: VueWrapper<any>) => wrapper.findAll(".tag-name").map((n) => n.text());

const fireInfinite = async (wrapper: VueWrapper<any>) => {
  const complete = vi.fn();
  wrapper.findComponent(InfiniteStub).vm.$emit("ionInfinite", { target: { complete } });
  await nextTick();
  await nextTick();
  return complete;
};

const type = async (wrapper: VueWrapper<any>, value: string) => {
  await wrapper.find("input").setValue(value);
};

const search = async (wrapper: VueWrapper<any>, value: string) => {
  await type(wrapper, value);
  vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  await nextTick();
};

beforeEach(() => {
  updates = {};
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ItemsOverview window", () => {
  it("mounts the first 40 of 1,000 cards and 40 more per infinite scroll event", async () => {
    const wrapper = mountOverview({ items: plants(1000) });
    expect(WINDOW_STEP).toBe(40);
    expect(cards(wrapper)).toHaveLength(40);

    const complete = await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(80);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted("load-more")).toBeUndefined();
  });

  it("emits load-more once the window reaches the end and more exist", async () => {
    const wrapper = mountOverview({ items: plants(100), hasMore: true });
    await fireInfinite(wrapper);
    expect(wrapper.emitted("load-more")).toBeUndefined();

    const complete = await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(100);
    expect(wrapper.emitted("load-more")).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("keeps the spinner until loadingMore settles and does not emit while loading", async () => {
    const wrapper = mountOverview({ items: plants(30), hasMore: true, loadingMore: true });
    const complete = await fireInfinite(wrapper);
    expect(wrapper.emitted("load-more")).toBeUndefined();
    expect(complete).not.toHaveBeenCalled();

    await wrapper.setProps({ loadingMore: false });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("clamps the window when the items shrink and does not regrow it", async () => {
    const wrapper = mountOverview({ items: plants(300) });
    await fireInfinite(wrapper);
    await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(120);

    await wrapper.setProps({ items: plants(50) });
    expect(cards(wrapper)).toHaveLength(50);

    await wrapper.setProps({ items: plants(300) });
    expect(cards(wrapper)).toHaveLength(80);
  });

  it("resets the window to 40 cards when listKey changes", async () => {
    const wrapper = mountOverview({ items: plants(200), listKey: "mine" });
    await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(80);

    await wrapper.setProps({ listKey: "public" });
    expect(cards(wrapper)).toHaveLength(40);
  });

  it("windows a presorted list in the parent's order", async () => {
    const reversed = [...plants(100)].reverse();
    const wrapper = mountOverview({ items: reversed, presorted: true });
    expect(cards(wrapper)).toHaveLength(40);
    expect(names(wrapper)[0]).toBe("Plant 0100");
    expect(names(wrapper)[39]).toBe("Plant 0061");
  });

  it("emits load-more at the window end in server mode", async () => {
    const wrapper = mountOverview({ items: plants(40), serverSearch: true, hasMore: true });
    await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(40);
    expect(wrapper.emitted("load-more")).toHaveLength(1);
  });

  it("completes the spinner on the next tick when the parent never reports loadingMore", async () => {
    const wrapper = mountOverview({ items: plants(30), hasMore: true });
    const complete = vi.fn();
    wrapper.findComponent(InfiniteStub).vm.$emit("ionInfinite", { target: { complete } });
    expect(complete).not.toHaveBeenCalled();
    await nextTick();
    await nextTick();
    expect(wrapper.emitted("load-more")).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("does not emit load-more at the end without hasMore", async () => {
    const wrapper = mountOverview({ items: plants(50) });
    await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(50);
    expect(wrapper.emitted("load-more")).toBeUndefined();
    expect(wrapper.findComponent(InfiniteStub).props("disabled")).toBe(true);
  });
});

describe("ItemsOverview render isolation", () => {
  it("re-renders only the card whose view model changed", async () => {
    const items = plants(3);
    const wrapper = mountOverview({ items });
    updates = {};

    const next = [...items];
    next[1] = Object.freeze({ ...items[1], description: "repotted" });
    await wrapper.setProps({ items: next });

    expect(updates.OverviewCard).toBe(1);
    expect(wrapper.findAll(".tag-sub").map((n) => n.text())).toEqual(["repotted"]);
  });

  it("does not update the overview or the grid when the page re-renders", async () => {
    const items = plants(50);
    const Page = defineComponent({
      data: () => ({ tick: 0 }),
      render() {
        return h("div", [
          h("span", String(this.tick)),
          h(ItemsOverview, { items, kind: "plant", ...handlers }),
        ]);
      },
    });
    const wrapper = mount(Page, { global: { stubs, mixins: [countUpdates] } });
    updates = {};

    (wrapper.vm as any).tick++;
    await nextTick();

    expect(wrapper.find("span").text()).toBe("1");
    expect(updates.ItemsOverview).toBeUndefined();
    expect(updates.ItemsGrid).toBeUndefined();
    expect(updates.OverviewCard).toBeUndefined();
  });

  it("keeps the grid out of scroll-to-top and refreshing re-renders", async () => {
    const wrapper = mountOverview({ items: plants(50) });
    updates = {};

    (wrapper.vm as any).handleScroll({ detail: { scrollTop: 500 } });
    await nextTick();
    expect(wrapper.find(".scroll-top-fab").exists()).toBe(true);

    (wrapper.vm as any).manualRefresh();
    await nextTick();

    expect(updates.ItemsOverview).toBeGreaterThan(0);
    expect(updates.ItemsGrid).toBeUndefined();
    expect(updates.OverviewCard).toBeUndefined();
  });
});

describe("ItemsOverview search", () => {
  it("runs one filter for keystrokes within 150 ms", async () => {
    let reads = 0;
    const items = ["fern", "ficus", "monstera"].map((name, i) =>
      Object.freeze({
        id: i + 1,
        name,
        get searchText() {
          reads++;
          return name;
        },
      }),
    );
    const wrapper = mountOverview({ items });
    const bar = wrapper.findComponent(SearchBar);
    expect(bar.emitted("search")).toBeUndefined();
    expect(reads).toBe(0);

    await type(wrapper, "f");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);
    await type(wrapper, "fi");
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50);
    await type(wrapper, "fic");
    await nextTick();
    expect(reads).toBe(0);
    expect(names(wrapper)).toHaveLength(3);

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    await nextTick();

    expect(bar.emitted("search")).toEqual([["fic"]]);
    expect(reads).toBe(items.length);
    expect(names(wrapper)).toEqual(["ficus"]);
  });

  it("matches searchText before name and falls back to name and description only", async () => {
    const wrapper = mountOverview({
      items: [
        Object.freeze({ id: 1, name: "Alpha", searchText: "zeta" }),
        Object.freeze({
          id: 2,
          name: "Beta",
          description: "Gamma",
          imageUrl: "https://cdn.example/alpha.webp",
        }),
      ],
    });

    await search(wrapper, "alpha");
    expect(names(wrapper)).toEqual([]);
    expect(wrapper.find(".state-block").attributes("data-kind")).toBe("empty");

    await search(wrapper, "zeta");
    expect(names(wrapper)).toEqual(["Alpha"]);

    await search(wrapper, "GAMMA");
    expect(names(wrapper)).toEqual(["Beta"]);
  });

  it("resets the window to 40 cards on a new query", async () => {
    const wrapper = mountOverview({ items: plants(200) });
    await fireInfinite(wrapper);
    expect(cards(wrapper)).toHaveLength(80);

    await search(wrapper, "plant");
    expect(cards(wrapper)).toHaveLength(40);
  });

  it("emits query-change in server mode and leaves the items unfiltered", async () => {
    const wrapper = mountOverview({ items: plants(3), serverSearch: true, total: 120 });

    await search(wrapper, "  zzz ");

    expect(wrapper.emitted("query-change")).toEqual([[{ q: "zzz" }]]);
    expect(cards(wrapper)).toHaveLength(3);
    expect(wrapper.find(".count").text()).toContain("120");
  });

  it("keeps the search bar for a server query without results", async () => {
    const wrapper = mountOverview({ items: plants(3), serverSearch: true });
    await search(wrapper, "zzz");
    await wrapper.setProps({ items: [] });

    expect(wrapper.findComponent(SearchBar).exists()).toBe(true);
    expect(wrapper.find(".state-block").attributes("data-kind")).toBe("empty");
  });
});

describe("ItemsOverview client-mode empty state", () => {
  it("shows the parent's empty state when the parent empties the list during a query", async () => {
    const wrapper = mountOverview({ items: plants(3) });
    await search(wrapper, "plant");
    await wrapper.setProps({ items: [] });

    expect(wrapper.find(".state-block").attributes("title")).toBe("overview.no_entries");
  });

  it("still shows the no-results state for a client query that filters everything", async () => {
    const wrapper = mountOverview({ items: plants(3) });
    await search(wrapper, "zzz");

    expect(wrapper.find(".state-block").attributes("title")).toBe("state.no_results_title");
  });
});

describe("ItemsOverview inactive page", () => {
  it("does not recompute while inactive and catches up when active again", async () => {
    let reads = 0;
    const counted = (id: number, name: string): OverviewItem =>
      Object.freeze({
        id,
        get name() {
          reads++;
          return name;
        },
      });
    const wrapper = mountOverview({ items: [counted(1, "b"), counted(2, "a")] });
    expect(names(wrapper)).toEqual(["a", "b"]);

    await wrapper.setProps({ active: false });
    updates = {};
    reads = 0;
    await wrapper.setProps({ items: [counted(3, "d"), counted(4, "c"), counted(5, "e")] });

    expect(reads).toBe(0);
    expect(updates.ItemsGrid).toBeUndefined();
    expect(cards(wrapper)).toHaveLength(2);

    await wrapper.setProps({ active: true });
    expect(names(wrapper)).toEqual(["c", "d", "e"]);
  });
});

describe("SearchBar", () => {
  it("does not emit on mount and limits the query to 100 characters", async () => {
    const wrapper = mount(SearchBar, { global: { stubs } });
    expect(wrapper.emitted("search")).toBeUndefined();
    expect(wrapper.find("input").attributes("maxlength")).toBe("100");

    await wrapper.find("input").setValue("x".repeat(120));
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(wrapper.emitted("search")).toEqual([["x".repeat(100)]]);
  });

  it("emits an emptied input at once without waiting for the debounce", async () => {
    const wrapper = mount(SearchBar, { global: { stubs } });
    await wrapper.find("input").setValue("aloe");
    await wrapper.find("input").setValue("");
    expect(wrapper.emitted("search")).toEqual([[""]]);

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(wrapper.emitted("search")).toEqual([[""]]);
  });

  it("emits a cleared query at once and drops the pending one", async () => {
    const wrapper = mount(SearchBar, { global: { stubs } });
    await wrapper.find("input").setValue("aloe");
    (wrapper.vm as any).clearSearch();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(wrapper.emitted("search")).toEqual([[""]]);
  });
});

describe("pageActive mixin", () => {
  it("turns false after ionViewDidLeave and true after ionViewWillEnter", () => {
    const Page = defineComponent({
      mixins: [pageActive],
      render() {
        return h("div");
      },
    });
    const wrapper = mount(Page);
    const vm = wrapper.vm as any;
    expect(vm.pageActive).toBe(true);
    expect(isActive(vm)).toBe(true);

    vm.onIonViewDidLeave.forEach((hook: () => void) => hook());
    expect(vm.pageActive).toBe(false);
    expect(isActive(vm)).toBe(false);

    vm.onIonViewWillEnter.forEach((hook: () => void) => hook());
    expect(vm.pageActive).toBe(true);
  });
});

describe("ItemsGrid", () => {
  it("renders a list with one item per view model and forwards the selection", async () => {
    const wrapper = mount(ItemsGrid, {
      props: { items: plants(2) },
      global: { stubs },
    });
    expect(wrapper.find("ul").attributes("role")).toBe("list");
    expect(wrapper.findAll("li")).toHaveLength(2);
    await wrapper.findAll(".tag-card")[1].trigger("click");
    expect(wrapper.emitted("select")).toEqual([[2]]);
  });
});
