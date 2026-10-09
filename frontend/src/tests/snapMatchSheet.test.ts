import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
  },
}));

import SnapMatchSheet from "@/components/water/SnapMatchSheet.vue";

const candidate = (plantId: number, tone: "ok" | "due" | "overdue" = "ok") => ({
  plantId,
  name: `Plant ${plantId}`,
  tone,
});

const mountSheet = (props: Record<string, unknown> = {}) =>
  shallowMount(SnapMatchSheet, {
    props: {
      isOpen: true,
      state: "candidates",
      candidates: [candidate(1, "overdue"), candidate(2), candidate(3)],
      confident: true,
      busy: false,
      loggedName: "",
      fertilizerTypes: [
        { id: 7, name: "Bloom" },
        { id: 8, name: "Grow" },
      ],
      ...props,
    },
    global: { renderStubDefaultSlot: true },
  });

const isDisabled = (el: { attributes(name: string): string | undefined }) =>
  el.attributes("disabled") !== undefined && el.attributes("disabled") !== "false";

describe("SnapMatchSheet", () => {
  it("asks for confirmation when the match is confident", () => {
    const wrapper = mountSheet();
    expect(wrapper.find(".sheet-title").text()).toBe("water.snap_is_this");
    expect(wrapper.findAll(".candidate")[0].classes()).toContain("highlight");
  });

  it("admits uncertainty and highlights nothing when the match is weak", () => {
    const wrapper = mountSheet({ confident: false });
    expect(wrapper.find(".sheet-title").text()).toBe("water.snap_not_sure");
    expect(wrapper.find(".candidate.highlight").exists()).toBe(false);
  });

  it("shows at most three candidates with their tone badge", () => {
    const wrapper = mountSheet({
      candidates: [candidate(1, "due"), candidate(2), candidate(3), candidate(4)],
    });
    expect(wrapper.findAll(".candidate")).toHaveLength(3);
    expect(wrapper.find(".tone-due").exists()).toBe(true);
  });

  it("offers only the other plant button when nothing matched", () => {
    const wrapper = mountSheet({ candidates: [] });
    expect(wrapper.find(".sheet-title").text()).toBe("water.snap_no_match");
    expect(wrapper.findAll(".candidate")).toHaveLength(0);
    expect(wrapper.find(".other-button").exists()).toBe(true);
  });

  it("disables every choice while a confirmation is in flight", async () => {
    const wrapper = mountSheet({ busy: true });
    for (const row of wrapper.findAll(".candidate")) expect(isDisabled(row)).toBe(true);
    expect(isDisabled(wrapper.find(".other-button"))).toBe(true);
    await wrapper.findAll(".candidate")[0].trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("emits the picked plant id and the other request", async () => {
    const wrapper = mountSheet();
    await wrapper.findAll(".candidate")[1].trigger("click");
    expect(wrapper.emitted("pick")).toEqual([[2]]);
    await wrapper.find(".other-button").trigger("click");
    expect(wrapper.emitted("other")).toHaveLength(1);
  });

  it("shows a spinner while matching", () => {
    const wrapper = mountSheet({ state: "matching", candidates: [] });
    expect(wrapper.text()).toContain("water.snap_matching");
    expect(wrapper.find(".candidate").exists()).toBe(false);
  });

  it("offers fertilizer chips and undo once logged", async () => {
    const wrapper = mountSheet({ state: "logged", loggedName: "Monty" });
    expect(wrapper.text()).toContain("Monty");
    const chips = wrapper.findAll(".fertilizer-chip");
    expect(chips).toHaveLength(2);
    await chips[1].trigger("click");
    expect(wrapper.emitted("fertilize")).toEqual([[8]]);
    await wrapper.find(".undo-button").trigger("click");
    expect(wrapper.emitted("undo")).toHaveLength(1);
    await wrapper.find(".done-button").trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
