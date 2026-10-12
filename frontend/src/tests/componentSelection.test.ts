/** The substrate component picker: one row component per catalogue entry, stable order, selection in a Set. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, reactive } from "vue";
import { mount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key} ${Object.values(vars).join(",")}` : key,
    getLocale: () => "en",
  },
}));

import ComponentSelection from "@/components/substrates/ComponentSelection.vue";

const passthrough = (tag = "div") =>
  defineComponent({
    render() {
      return h(tag, this.$slots.default?.());
    },
  });

const IonCheckboxStub = defineComponent({
  emits: ["ionChange"],
  render() {
    return h("label", [
      h("input", { type: "checkbox", onChange: () => this.$emit("ionChange") }),
      this.$slots.default?.(),
    ]);
  },
});

const IonInputStub = defineComponent({
  emits: ["ionInput", "ionBlur"],
  render() {
    return h("input", {
      class: "part-field",
      onInput: (event: Event) =>
        this.$emit("ionInput", { detail: { value: (event.target as HTMLInputElement).value } }),
      onBlur: () => this.$emit("ionBlur"),
    });
  },
});

const IonSearchbarStub = defineComponent({
  emits: ["ionInput"],
  render() {
    return h("input", {
      class: "search-field",
      onInput: (event: Event) =>
        this.$emit("ionInput", { detail: { value: (event.target as HTMLInputElement).value } }),
    });
  },
});

const stubs = {
  IonItem: passthrough(),
  IonCheckbox: IonCheckboxStub,
  IonInput: IonInputStub,
  IonSearchbar: IonSearchbarStub,
};

const catalogue = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Component ${String(i + 1).padStart(2, "0")}`,
    fineness: "Fine",
    searchText: `component ${String(i + 1).padStart(2, "0")}\nfine`,
  }));

const mountPicker = (
  options: {
    count?: number;
    selected?: number[];
    parts?: Record<number, number | string>;
    components?: ReturnType<typeof catalogue>;
  } = {},
) => {
  const updates: string[] = [];
  const selectedIds = reactive(options.selected ?? [1, 2, 3]);
  const parts = reactive<Record<number, number | string>>(
    options.parts ?? { 1: "1", 2: "2", 3: "3" },
  );
  const wrapper = mount(ComponentSelection, {
    props: {
      title: "Select",
      components: options.components ?? catalogue(options.count ?? 40),
      selectedComponentIds: selectedIds,
      componentParts: parts,
    },
    global: {
      stubs,
      mixins: [
        {
          updated() {
            const name = (this as unknown as { $options: { name?: string } }).$options.name;
            if (name === "ComponentPartRow") updates.push(name);
          },
        },
      ],
    },
  });
  return { wrapper, updates, selectedIds, parts };
};

const rowNames = (wrapper: ReturnType<typeof mountPicker>["wrapper"]) =>
  wrapper.findAll(".part-name").map((node) => node.text());

afterEach(() => {
  vi.useRealTimers();
});

describe("rows", () => {
  it("renders one row component per catalogue entry", () => {
    const { wrapper } = mountPicker({ count: 40 });
    expect(wrapper.findAllComponents({ name: "ComponentPartRow" })).toHaveLength(40);
  });

  it("re-renders one row for a part keystroke", async () => {
    const { updates, parts } = mountPicker({ count: 40 });
    updates.length = 0;
    parts[2] = "5";
    await nextTick();
    expect(updates).toHaveLength(1);
  });

  it("re-renders one row when a component is ticked", async () => {
    const { updates, selectedIds } = mountPicker({ count: 40 });
    updates.length = 0;
    selectedIds.push(10);
    await nextTick();
    expect(updates).toHaveLength(1);
  });

  it("reports typed parts upward with the component id", async () => {
    const { wrapper } = mountPicker({ count: 40 });
    await wrapper.findAll(".part-field")[0].setValue("4");
    expect(wrapper.emitted("update-part")![0]).toEqual([1, "4"]);
  });

  it("emits the toggle of the ticked component", async () => {
    const { wrapper } = mountPicker({ count: 5, selected: [], parts: {} });
    await wrapper.findAll('input[type="checkbox"]')[4].trigger("change");
    expect(wrapper.emitted("toggle-component")![0]).toEqual([4]);
  });
});

describe("order and the selected block", () => {
  it("keeps the given order when components are ticked", async () => {
    const { wrapper, selectedIds } = mountPicker({ count: 12, selected: [], parts: {} });
    const before = rowNames(wrapper);
    selectedIds.push(9, 4);
    await nextTick();
    expect(rowNames(wrapper)).toEqual(before);
    expect(before[0]).toBe("Component 01");
  });

  it("does not move selected components to the top", () => {
    const { wrapper } = mountPicker({ count: 12, selected: [12], parts: { 12: "1" } });
    expect(rowNames(wrapper)[0]).toBe("Component 01");
    expect(rowNames(wrapper)[11]).toBe("Component 12");
  });

  it("shows the selected count and names in a block above the list", async () => {
    const { wrapper, selectedIds } = mountPicker({ count: 12, selected: [2, 3], parts: {} });
    expect(wrapper.find(".selected-count").text()).toBe("components.selected_count 2");
    expect(wrapper.findAll(".selected-chip").map((chip) => chip.text())).toEqual([
      "Component 02",
      "Component 03",
    ]);
    selectedIds.push(5);
    await nextTick();
    expect(wrapper.find(".selected-count").text()).toBe("components.selected_count 3");
    expect(wrapper.findAll(".selected-chip")).toHaveLength(3);
  });

  it("keeps the block with a zero count when nothing is selected", () => {
    const { wrapper } = mountPicker({ count: 3, selected: [], parts: {} });
    expect(wrapper.find(".selected-count").text()).toBe("components.selected_count 0");
    expect(wrapper.findAll(".selected-chip")).toHaveLength(0);
  });
});

describe("search", () => {
  it("filters after the search bar debounce and matches the precomputed search text", async () => {
    vi.useFakeTimers();
    const { wrapper } = mountPicker({ count: 40 });
    const field = wrapper.find(".search-field");
    await field.setValue("c");
    await field.setValue("component 0");
    await field.setValue("component 07");
    expect(rowNames(wrapper)).toHaveLength(40);
    await vi.advanceTimersByTimeAsync(200);
    expect(rowNames(wrapper)).toEqual(["Component 07"]);
  });

  it("shows only the selected components when asked to", async () => {
    const { wrapper } = mountPicker({ count: 20, selected: [3, 8], parts: { 3: "1", 8: "1" } });
    await wrapper.setData({ showSelectedOnly: true });
    expect(rowNames(wrapper)).toEqual(["Component 03", "Component 08"]);
  });

  it("falls back to the name when an entry has no search text", async () => {
    vi.useFakeTimers();
    const { wrapper } = mountPicker({
      components: [
        { id: 1, name: "Perlite", fineness: "Fine" },
        { id: 2, name: "Peat", fineness: "Fine" },
      ] as ReturnType<typeof catalogue>,
      selected: [],
      parts: {},
    });
    await wrapper.find(".search-field").setValue("peat");
    await vi.advanceTimersByTimeAsync(200);
    expect(rowNames(wrapper)).toEqual(["Peat"]);
  });
});
