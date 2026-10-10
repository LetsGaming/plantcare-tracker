import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
    getLocale: () => "en",
  },
}));

import RoundList from "@/components/water/RoundList.vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";

describe("RoundList", () => {
  it("names the fertilizer options in the app language", async () => {
    const wrapper = shallowMount(RoundList, {
      props: {
        rows: [
          {
            plantId: 1,
            name: "Monty",
            checked: false,
            tone: "ok",
            rank: 0,
            fertilizerTypeId: undefined,
          },
        ],
        fertilizerTypes: [
          { id: 1, name: "organic" },
          { id: 2, name: "synthetic" },
        ],
      },
      global: { renderStubDefaultSlot: true },
    });
    await wrapper.find(".override-edit").trigger("click");
    const options = wrapper.findAll("ion-select-option-stub").map((o) => o.text());
    expect(options).toContain("copy2.fertilizer.organic");
    expect(options).toContain("copy2.fertilizer.synthetic");
  });

  it("labels a never watered row with its own chip", () => {
    const wrapper = shallowMount(RoundList, {
      props: {
        rows: [
          {
            plantId: 1,
            name: "Fresh",
            checked: true,
            tone: "new",
            rank: -8.5,
            fertilizerTypeId: undefined,
          },
        ],
        fertilizerTypes: [],
      },
      global: { renderStubDefaultSlot: true },
    });
    const chip = wrapper.find(".tone-chip");
    expect(chip.text()).toBe("plantlist.new");
    expect(chip.classes()).toContain("tone-new");
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  plantId: 7,
  name: "Monty",
  checked: false,
  tone: "ok",
  rank: 0,
  fertilizerTypeId: undefined,
  ...over,
});
const types = [
  { id: 1, name: "organic" },
  { id: 2, name: "synthetic" },
];
const mountList = (rows: unknown[]) =>
  shallowMount(RoundList, {
    props: { rows: rows as never, fertilizerTypes: types as never },
    global: { renderStubDefaultSlot: true },
  });

describe("RoundList row details", () => {
  it("keeps the fertilizer select closed until the edit button is pressed", async () => {
    const wrapper = mountList([row()]);
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
    const edit = wrapper.find(".override-edit");
    expect(edit.attributes("aria-label")).toBe("water.override_edit");
    expect(edit.attributes("fill")).toBe("clear");
    await edit.trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(true);
    await wrapper.find(".override-edit").trigger("click");
    expect(wrapper.find("ion-select-stub").exists()).toBe(false);
  });

  it("shows the select and a chip with the fertilizer name while an override is set", () => {
    const wrapper = mountList([row({ fertilizerTypeId: 1 })]);
    expect(wrapper.find("ion-select-stub").exists()).toBe(true);
    expect(wrapper.find(".override-chip").text()).toBe("copy2.fertilizer.organic");
  });

  it("names an explicit no fertilizer override in the chip", () => {
    const wrapper = mountList([row({ fertilizerTypeId: null })]);
    expect(wrapper.find(".override-chip").text()).toBe("water.fertilizer_none");
  });

  it("shows no chip while the row follows the round", () => {
    expect(mountList([row()]).find(".override-chip").exists()).toBe(false);
  });

  it("clears the override when the select returns to the round default", async () => {
    const wrapper = mountList([row({ fertilizerTypeId: 1 })]);
    wrapper.findComponent({ name: "IonSelect" }).vm.$emit("ionChange", {
      detail: { value: "default" },
    });
    expect(wrapper.emitted("set-fertilizer")?.[0]).toEqual([7, undefined]);
  });

  it("tints the placeholder per plant when there is no photo", () => {
    const wrapper = mountList([row({ plantId: 7 }), row({ plantId: 8, imageUrl: "/a.jpg" })]);
    const placeholders = wrapper.findAllComponents(PlantPlaceholder);
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].props("seed")).toBe("7");
    expect(placeholders[0].props("kind")).toBe("plant");
    expect(wrapper.findAll("img")).toHaveLength(1);
  });
});
