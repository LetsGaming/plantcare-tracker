import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, shallowMount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive } from "vue";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));

import RoundList from "@/components/water/RoundList.vue";
import RoundRow from "@/components/water/RoundRow.vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import PlantMapper from "@/mapping/PlantMapping";
import { apiImageDto, apiPlantListItem } from "@/tests/helpers";
import type { RoundRow as RoundRowData } from "@/utils/waterRound";

const types = [
  { id: 1, name: "organic" },
  { id: 2, name: "synthetic" },
] as FertilizerType[];

const rowProps = (over: Record<string, unknown> = {}) => ({
  plantId: 7,
  name: "Monty",
  image: null,
  tone: "ok",
  checked: false,
  hasOverride: false,
  overrideId: null,
  fertilizerTypes: types,
  ...over,
});

const mountRow = (over: Record<string, unknown> = {}) =>
  shallowMount(RoundRow, {
    props: rowProps(over) as never,
    global: { renderStubDefaultSlot: true },
  });

describe("RoundRow", () => {
  it("names the fertilizer options in the app language", async () => {
    const wrapper = mountRow();
    await wrapper.find(".override-edit").trigger("click");
    const options = wrapper.findAll("ion-select-option-stub").map((o) => o.text());
    expect(options).toContain("copy2.fertilizer.organic");
    expect(options).toContain("copy2.fertilizer.synthetic");
  });

  it("labels a never watered row with its own chip", () => {
    const chip = mountRow({ name: "Fresh", checked: true, tone: "new" }).find(".tone-chip");
    expect(chip.text()).toBe("plantlist.new");
    expect(chip.classes()).toContain("tone-new");
  });

  it("shows no tone chip for a plant that is fine", () => {
    expect(mountRow().find(".tone-chip").exists()).toBe(false);
  });

  it("keeps the fertilizer select closed until the edit button is pressed", async () => {
    const wrapper = mountRow();
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
    const edit = wrapper.find(".override-edit");
    expect(edit.attributes("aria-label")).toBe("water.override_edit");
    expect(edit.attributes("fill")).toBe("clear");
    await edit.trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(true);
    await wrapper.find(".override-edit").trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
  });

  it("offers no editor without fertilizer types", () => {
    const wrapper = mountRow({ fertilizerTypes: [] });
    expect(wrapper.find(".override-edit").exists()).toBe(false);
  });

  it("shows only the chip, inside the text column, while an override is set and the editor is closed", () => {
    const wrapper = mountRow({ hasOverride: true, overrideId: 1 });
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
    const chip = wrapper.find(".override-chip");
    expect(chip.text()).toBe("copy2.fertilizer.organic");
    expect(chip.element.parentElement?.classList.contains("text")).toBe(true);
  });

  it("swaps the chip for the select when the editor opens and back when it closes", async () => {
    const wrapper = mountRow({ hasOverride: true, overrideId: 1 });
    await wrapper.find(".override-edit").trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(true);
    expect(wrapper.find(".override-chip").exists()).toBe(false);
    await wrapper.find(".override-edit").trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
    expect(wrapper.find(".override-chip").exists()).toBe(true);
  });

  it("names an explicit no fertilizer override in the chip", () => {
    const wrapper = mountRow({ hasOverride: true, overrideId: null });
    expect(wrapper.find(".override-chip").text()).toBe("water.fertilizer_none");
  });

  it("shows no chip while the row follows the round", () => {
    expect(mountRow().find(".override-chip").exists()).toBe(false);
  });

  it("preselects the current override in the open editor", async () => {
    const wrapper = mountRow({ hasOverride: true, overrideId: 2 });
    await wrapper.find(".override-edit").trigger("click");
    expect(wrapper.findComponent({ name: "IonSelect" }).props("value")).toBe(2);
    const none = mountRow({ hasOverride: true, overrideId: null });
    await none.find(".override-edit").trigger("click");
    expect(none.findComponent({ name: "IonSelect" }).props("value")).toBe("none");
    const follow = mountRow();
    await follow.find(".override-edit").trigger("click");
    expect(follow.findComponent({ name: "IonSelect" }).props("value")).toBe("default");
  });

  it("emits the new override and closes the editor when the select changes", async () => {
    const wrapper = mountRow({ hasOverride: true, overrideId: 1 });
    await wrapper.find(".override-edit").trigger("click");
    wrapper.findComponent({ name: "IonSelect" }).vm.$emit("ionChange", {
      detail: { value: "default" },
    });
    await nextTick();
    expect(wrapper.emitted("set-fertilizer")?.[0]).toEqual([7, undefined]);
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
  });

  it("emits the plant id when the box is ticked", async () => {
    const wrapper = mountRow();
    await wrapper.find(".tick-box").trigger("change");
    expect(wrapper.emitted("toggle")?.[0]).toEqual([7]);
  });

  it("renders the thumbnail through the image component at the 64px size, seeded per plant", () => {
    const image = PlantMapper.mapListItem(apiPlantListItem({ cover: apiImageDto() })).cover;
    const thumb = mountRow({ image }).findComponent(ProgressiveImage);
    expect(thumb.props("image")).toEqual(image);
    expect(thumb.props("sizes")).toBe("64px");
    expect(thumb.props("seed")).toBe("7");
    expect(mountRow().findComponent(ProgressiveImage).props("image")).toBeNull();
  });
});

const base = (plantId: number): RoundRowData => ({
  plantId,
  name: `Plant ${plantId}`,
  key: `plant ${plantId}`,
  image: null,
  tone: "ok",
  rank: 0,
  preChecked: false,
});

describe("RoundList", () => {
  const renders = new Map<number, number>();
  const CountingRow = defineComponent({
    name: "RoundRow",
    props: {
      plantId: { type: Number, required: true },
      name: String,
      image: Object,
      tone: String,
      checked: Boolean,
      hasOverride: Boolean,
      overrideId: Number,
      fertilizerTypes: Array,
    },
    render() {
      renders.set(this.plantId, (renders.get(this.plantId) ?? 0) + 1);
      return h("li");
    },
  });

  beforeEach(() => renders.clear());

  const mountList = () => {
    const checkedIds = reactive(new Set<number>([2]));
    const overrides = reactive(new Map<number, number | null>());
    const wrapper = mount(RoundList, {
      props: {
        rows: [base(1), base(2), base(3), base(4)],
        checkedIds,
        overrides,
        fertilizerTypes: types,
      },
      global: { stubs: { RoundRow: CountingRow } },
    });
    return { wrapper, checkedIds, overrides };
  };

  it("renders one row per plant with primitive state taken from the sets", () => {
    const { wrapper } = mountList();
    const rows = wrapper.findAllComponents(CountingRow);
    expect(rows.map((row) => row.props("plantId"))).toEqual([1, 2, 3, 4]);
    expect(rows.map((row) => row.props("checked"))).toEqual([false, true, false, false]);
  });

  it("re-renders only the tapped row when a box is ticked", async () => {
    const { checkedIds } = mountList();
    renders.clear();
    checkedIds.add(3);
    await nextTick();
    expect([...renders.entries()]).toEqual([[3, 1]]);
  });

  it("re-renders only the tapped row when a box is unticked", async () => {
    const { checkedIds } = mountList();
    renders.clear();
    checkedIds.delete(2);
    await nextTick();
    expect([...renders.entries()]).toEqual([[2, 1]]);
  });

  it("re-renders only the row whose fertilizer override changes", async () => {
    const { wrapper, overrides } = mountList();
    renders.clear();
    overrides.set(4, 2);
    await nextTick();
    expect([...renders.entries()]).toEqual([[4, 1]]);
    const row = wrapper.findAllComponents(CountingRow)[3];
    expect(row.props("hasOverride")).toBe(true);
    expect(row.props("overrideId")).toBe(2);
  });

  it("passes an explicit no fertilizer override as a null id", async () => {
    const { wrapper, overrides } = mountList();
    overrides.set(1, null);
    await nextTick();
    const row = wrapper.findAllComponents(CountingRow)[0];
    expect(row.props("hasOverride")).toBe(true);
    expect(row.props("overrideId")).toBeNull();
  });

  it("mounts the first 40 rows, grows by 40 per infinite event and reports checked state for all", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => base(i + 1));
    const checkedIds = reactive(new Set<number>([95]));
    const wrapper = mount(RoundList, {
      props: { rows, checkedIds, overrides: reactive(new Map()), fertilizerTypes: types },
      global: { stubs: { RoundRow: CountingRow } },
    });
    expect(wrapper.findAllComponents(CountingRow)).toHaveLength(40);
    const scroll = wrapper.findComponent({ name: "IonInfiniteScroll" });
    expect(scroll.props("disabled")).toBe(false);

    const complete = vi.fn();
    scroll.vm.$emit("ionInfinite", { target: { complete } });
    await nextTick();
    expect(wrapper.findAllComponents(CountingRow)).toHaveLength(80);
    expect(complete).toHaveBeenCalledTimes(1);

    scroll.vm.$emit("ionInfinite", { target: { complete } });
    await nextTick();
    const all = wrapper.findAllComponents(CountingRow);
    expect(all).toHaveLength(100);
    expect(all[94].props("checked")).toBe(true);
    expect(scroll.props("disabled")).toBe(true);
  });

  it("starts again at 40 rows when the number of rows changes", async () => {
    const rows = Array.from({ length: 100 }, (_, i) => base(i + 1));
    const wrapper = mount(RoundList, {
      props: {
        rows,
        checkedIds: reactive(new Set<number>()),
        overrides: reactive(new Map()),
        fertilizerTypes: types,
      },
      global: { stubs: { RoundRow: CountingRow } },
    });
    wrapper
      .findComponent({ name: "IonInfiniteScroll" })
      .vm.$emit("ionInfinite", { target: { complete: vi.fn() } });
    await nextTick();
    expect(wrapper.findAllComponents(CountingRow)).toHaveLength(80);
    await wrapper.setProps({ rows: rows.slice(0, 70) });
    expect(wrapper.findAllComponents(CountingRow)).toHaveLength(40);
  });

  it("relays the row events", () => {
    const { wrapper } = mountList();
    const first = wrapper.findAllComponents(CountingRow)[0];
    first.vm.$emit("toggle", 1);
    first.vm.$emit("set-fertilizer", 1, null);
    expect(wrapper.emitted("toggle")?.[0]).toEqual([1]);
    expect(wrapper.emitted("set-fertilizer")?.[0]).toEqual([1, null]);
  });
});
