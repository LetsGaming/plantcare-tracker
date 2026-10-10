import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key },
}));

import SnapButton from "@/components/water/SnapButton.vue";

const pick = async (file: File) => {
  const wrapper = shallowMount(SnapButton);
  const input = wrapper.find("input[type=file]");
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  return { wrapper, input };
};

describe("SnapButton", () => {
  it("opens the camera input on the environment camera", () => {
    const wrapper = shallowMount(SnapButton);
    const input = wrapper.find("input[type=file]");
    expect(input.attributes("capture")).toBe("environment");
    expect(input.attributes("accept")).toBe("image/*");
  });

  it("shows a visible label", () => {
    const wrapper = shallowMount(SnapButton, { global: { renderStubDefaultSlot: true } });
    expect(wrapper.find(".snap-trigger").text()).toContain("water.snap");
  });

  it("emits a valid photo", async () => {
    const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
    const { wrapper } = await pick(file);
    expect(wrapper.emitted("photo")).toEqual([[file]]);
  });

  it("rejects an unsupported type with a clear reason", async () => {
    const { wrapper } = await pick(new File(["x"], "p.heic", { type: "image/heic" }));
    expect(wrapper.emitted("invalid")).toEqual([["type"]]);
    expect(wrapper.emitted("photo")).toBeUndefined();
  });

  it("rejects an oversized photo", async () => {
    const big = new File([new Uint8Array(11 * 1024 * 1024)], "p.jpg", { type: "image/jpeg" });
    const { wrapper } = await pick(big);
    expect(wrapper.emitted("invalid")).toEqual([["size"]]);
  });
});

describe("SnapButton presentation", () => {
  it("is a solid button by default and takes an outline fill", () => {
    const solid = shallowMount(SnapButton, { global: { renderStubDefaultSlot: true } });
    expect(solid.find(".snap-trigger").attributes("fill")).toBe("solid");
    const outline = shallowMount(SnapButton, {
      props: { fill: "outline" },
      global: { renderStubDefaultSlot: true },
    });
    expect(outline.find(".snap-trigger").attributes("fill")).toBe("outline");
  });

  it("focuses its button on demand", () => {
    const wrapper = shallowMount(SnapButton, {
      global: { renderStubDefaultSlot: true },
      attachTo: document.body,
    });
    const el = wrapper.find(".snap-trigger").element as HTMLElement;
    el.tabIndex = 0;
    (wrapper.vm as unknown as { focusButton(): void }).focusButton();
    expect(document.activeElement).toBe(el);
    wrapper.unmount();
  });
});
