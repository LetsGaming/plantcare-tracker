/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";

vi.mock("@/services/general/LocalizationService", () => ({
  default: {
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key} ${JSON.stringify(vars)}` : key,
  },
}));

import SnapMatchSheet from "@/components/water/SnapMatchSheet.vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import PlantMapper from "@/mapping/PlantMapping";
import { apiImageDto, apiPlantListItem } from "@/tests/helpers";

const coverOf = (): ImageView =>
  PlantMapper.mapListItem(apiPlantListItem({ cover: apiImageDto() })).cover!;

const candidate = (plantId: number, tone: "ok" | "due" | "overdue" | "new" = "ok") => ({
  plantId,
  name: `Plant ${plantId}`,
  image: null,
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
    attachTo: document.body,
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

  it("badges a never watered candidate with the new tone", () => {
    const wrapper = mountSheet({ candidates: [candidate(1, "new"), candidate(2)] });
    const chip = wrapper.findAll(".candidate")[0].find(".tone-chip");
    expect(chip.text()).toBe("plantlist.new");
    expect(chip.classes()).toContain("tone-new");
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

  it("disables logged actions while busy and marks the selected fertilizer", async () => {
    const wrapper = mountSheet({
      state: "logged",
      loggedName: "Monty",
      busy: true,
      selectedFertilizerId: 8,
    });
    for (const chip of wrapper.findAll(".fertilizer-chip")) expect(isDisabled(chip)).toBe(true);
    expect(isDisabled(wrapper.find(".undo-button"))).toBe(true);
    expect(isDisabled(wrapper.find(".done-button"))).toBe(true);
    const chips = wrapper.findAll(".fertilizer-chip");
    expect(chips[1].classes()).toContain("selected");
    expect(chips[0].classes()).not.toContain("selected");
  });

  it("blocks dismissal while busy", () => {
    expect(mountSheet({ busy: true }).findComponent({ name: "IonModal" }).props("canDismiss")).toBe(
      false,
    );
    expect(mountSheet().findComponent({ name: "IonModal" }).props("canDismiss")).toBe(true);
  });

  it("names the fertilizer chips in the app language", () => {
    const wrapper = mountSheet({
      state: "logged",
      fertilizerTypes: [{ id: 7, name: "organic" }],
    });
    expect(wrapper.find(".fertilizer-chip").text()).toBe("copy2.fertilizer.organic");
  });

  it("tags each fertilizer chip with its kind", () => {
    const wrapper = mountSheet({
      state: "logged",
      fertilizerTypes: [
        { id: 1, name: "organic" },
        { id: 2, name: "synthetic" },
      ],
    });
    expect(wrapper.findAll(".fertilizer-chip").map((c) => c.attributes("data-kind"))).toEqual([
      "organic",
      "mineral",
    ]);
  });
});

describe("SnapMatchSheet focus and announcements", () => {
  it("does not move focus on the initial render", async () => {
    const wrapper = mountSheet();
    await nextTick();
    expect(document.activeElement).toBe(document.body);
    wrapper.unmount();
  });

  it("focuses the logged heading when the state changes to logged", async () => {
    const wrapper = mountSheet({ loggedName: "Monty" });
    await wrapper.setProps({ state: "logged" });
    await nextTick();
    const title = wrapper.find(".sheet-title");
    expect(title.attributes("tabindex")).toBe("-1");
    expect(document.activeElement).toBe(title.element);
    wrapper.unmount();
  });

  it("focuses the candidates heading when matching finishes", async () => {
    const wrapper = mountSheet({ state: "matching", candidates: [] });
    await wrapper.setProps({ state: "candidates", candidates: [candidate(1)] });
    await nextTick();
    expect(document.activeElement).toBe(wrapper.find(".sheet-title").element);
    wrapper.unmount();
  });

  it("does not steal focus while matching", async () => {
    const wrapper = mountSheet({ state: "candidates" });
    await wrapper.setProps({ state: "matching" });
    await nextTick();
    expect(document.activeElement).toBe(document.body);
    wrapper.unmount();
  });

  it("announces the logged state in a persistent polite live region", async () => {
    const wrapper = mountSheet({ loggedName: "Monty" });
    const region = wrapper.find(".sr-status");
    expect(region.attributes("role")).toBe("status");
    expect(region.attributes("aria-live")).toBe("polite");
    expect(region.text()).toBe("");
    await wrapper.setProps({ state: "logged" });
    expect(wrapper.find(".sr-status").text()).toContain("water.snap_logged");
    expect(wrapper.find(".sr-status").text()).toContain("Monty");
    wrapper.unmount();
  });

  it("groups the chips under a visible label", () => {
    const wrapper = mountSheet({ state: "logged", loggedName: "Monty" });
    const group = wrapper.find(".chips-group");
    expect(group.attributes("role")).toBe("group");
    const label = wrapper.find(`#${group.attributes("aria-labelledby")}`);
    expect(label.exists()).toBe(true);
    expect(label.text()).toBe("water.fertilizer_prompt");
    expect(group.findAll(".fertilizer-chip")).toHaveLength(2);
    wrapper.unmount();
  });

  it("shows the plant image as a decorative 64px thumbnail when logged", () => {
    const image = coverOf();
    const wrapper = mountSheet({ state: "logged", loggedName: "Monty", loggedImage: image });
    const thumb = wrapper.findComponent(ProgressiveImage);
    expect(thumb.props("image")).toEqual(image);
    expect(thumb.props("sizes")).toBe("64px");
    expect(wrapper.find(".logged-thumb").attributes("aria-hidden")).toBe("true");
    wrapper.unmount();
  });

  it("falls back to a seeded placeholder without an image", () => {
    const wrapper = mountSheet({ state: "logged", loggedName: "Monty", loggedPlantId: 5 });
    const thumb = wrapper.findComponent(ProgressiveImage);
    expect(thumb.props("image")).toBeNull();
    expect(thumb.props("seed")).toBe("5");
    wrapper.unmount();
  });

  it("renders candidate thumbnails from the image view at the 64px size", () => {
    const image = coverOf();
    const wrapper = mountSheet({
      candidates: [{ ...candidate(1), image }, candidate(2)],
    });
    const thumbs = wrapper.findAllComponents(ProgressiveImage);
    expect(thumbs[0].props("image")).toEqual(image);
    expect(thumbs[0].props("sizes")).toBe("64px");
    expect(thumbs[1].props("image")).toBeNull();
    expect(thumbs[1].props("seed")).toBe("2");
    wrapper.unmount();
  });

  it("makes done the solid action and undo text only", () => {
    const wrapper = mountSheet({ state: "logged", loggedName: "Monty" });
    const buttons = wrapper.findAllComponents({ name: "IonButton" });
    const undo = buttons.find((b) => b.classes().includes("undo-button"));
    const done = buttons.find((b) => b.classes().includes("done-button"));
    expect(undo?.props("fill")).toBe("clear");
    expect(done?.props("fill")).not.toBe("outline");
    expect(done?.props("fill")).not.toBe("clear");
    wrapper.unmount();
  });
});

describe("SnapMatchSheet chip colors", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "..", "components/water/SnapMatchSheet.vue"),
    "utf8",
  );
  const ruleBody = (selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, "m").exec(source)?.[1] ?? "";
  };

  it.each([
    ["organic", "--feed-organic"],
    ["mineral", "--feed-mineral"],
  ])("paints %s chips with their feed token", (kind, token) => {
    const chip = ruleBody(`.fertilizer-chip[data-kind="${kind}"]`);
    expect(chip).toContain(`border-color: var(${token})`);
    expect(chip).toContain(`color: var(${token})`);
    const selected = ruleBody(`.fertilizer-chip[data-kind="${kind}"].selected`);
    expect(selected).toContain(`background: var(${token})`);
    expect(selected).toContain(`color: var(${token}-contrast)`);
  });

  it("keeps the done button primary", () => {
    expect(source).not.toMatch(/\.done-button[^{]*\{[^}]*--feed-/);
    expect(source).toMatch(/class="done-button"(?![^>]*color=)/);
  });
});
