import { describe, it, expect, vi } from "vitest";
import { defineComponent, h } from "vue";
import { shallowMount } from "@vue/test-utils";

vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ImageModal from "@/components/images/ImageModal.vue";
import IconButton from "@/components/ui/IconButton.vue";

const IonModalStub = defineComponent({
  inheritAttrs: true,
  render() {
    return h("div", this.$slots.default?.());
  },
});

const mountModal = (props: Record<string, unknown> = {}) =>
  shallowMount(ImageModal, {
    props: { isOpen: true, imageUrl: "/a.png", label: "May 1", ...props },
    global: { stubs: { IonModal: IonModalStub }, renderStubDefaultSlot: true },
    attachTo: document.body,
  });

type Mounted = ReturnType<typeof mountModal>;

const scale = (wrapper: Mounted) => (wrapper.vm as unknown as { zoomScale: number }).zoomScale;
const offsets = (wrapper: Mounted) => {
  const vm = wrapper.vm as unknown as { offsetX: number; offsetY: number };
  return [vm.offsetX, vm.offsetY];
};
const button = (wrapper: Mounted, label: string) => {
  const found = wrapper.findAllComponents(IconButton).find((b) => b.props("label") === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
};
const surface = (wrapper: Mounted) => wrapper.find(".zoomable-image-wrapper");
const press = (wrapper: Mounted, key: string) => surface(wrapper).trigger("keydown", { key });
const touches = (distance: number) => [
  { clientX: 100, clientY: 100 },
  { clientX: 100 + distance, clientY: 100 },
];

describe("ImageModal zoom buttons", () => {
  it("renders the three labeled zoom buttons", () => {
    const wrapper = mountModal();
    const labels = wrapper.findAllComponents(IconButton).map((b) => b.props("label"));
    expect(labels).toEqual(
      expect.arrayContaining(["a11y.zoom_in", "a11y.zoom_out", "a11y.zoom_reset"]),
    );
  });

  it("zooms in on the zoom in button and returns to 1 on reset", () => {
    const wrapper = mountModal();
    button(wrapper, "a11y.zoom_in").vm.$emit("press");
    expect(scale(wrapper)).toBe(1.5);
    button(wrapper, "a11y.zoom_in").vm.$emit("press");
    expect(scale(wrapper)).toBe(2);
    button(wrapper, "a11y.zoom_out").vm.$emit("press");
    expect(scale(wrapper)).toBe(1.5);
    button(wrapper, "a11y.zoom_reset").vm.$emit("press");
    expect(scale(wrapper)).toBe(1);
    expect(offsets(wrapper)).toEqual([0, 0]);
  });

  it("disables zoom out and reset at 1 and zoom in at the maximum", async () => {
    const wrapper = mountModal();
    expect(button(wrapper, "a11y.zoom_out").props("disabled")).toBe(true);
    expect(button(wrapper, "a11y.zoom_reset").props("disabled")).toBe(true);
    expect(button(wrapper, "a11y.zoom_in").props("disabled")).toBe(false);
    for (let i = 0; i < 4; i++) button(wrapper, "a11y.zoom_in").vm.$emit("press");
    await wrapper.vm.$nextTick();
    expect(scale(wrapper)).toBe(3);
    expect(button(wrapper, "a11y.zoom_in").props("disabled")).toBe(true);
    expect(button(wrapper, "a11y.zoom_out").props("disabled")).toBe(false);
  });
});

describe("ImageModal keyboard", () => {
  it("makes the image surface a labeled focusable group", () => {
    const wrapper = mountModal();
    const el = surface(wrapper);
    expect(el.attributes("tabindex")).toBe("0");
    expect(el.attributes("role")).toBe("group");
    expect(el.attributes("aria-label")).toBe("May 1");
  });

  it("zooms with plus and equals, out with minus, and resets with zero", async () => {
    const wrapper = mountModal();
    await press(wrapper, "+");
    expect(scale(wrapper)).toBe(1.5);
    await press(wrapper, "=");
    expect(scale(wrapper)).toBe(2);
    await press(wrapper, "-");
    expect(scale(wrapper)).toBe(1.5);
    await press(wrapper, "0");
    expect(scale(wrapper)).toBe(1);
  });

  it("pans with arrow keys only while zoomed", async () => {
    const wrapper = mountModal();
    await press(wrapper, "ArrowLeft");
    expect(offsets(wrapper)).toEqual([0, 0]);
    await press(wrapper, "+");
    await press(wrapper, "ArrowLeft");
    await press(wrapper, "ArrowDown");
    expect(offsets(wrapper)).toEqual([40, -40]);
    await press(wrapper, "0");
    expect(offsets(wrapper)).toEqual([0, 0]);
  });

  it("zooming back to 1 with minus clears the pan offsets", async () => {
    const wrapper = mountModal();
    await press(wrapper, "+");
    await press(wrapper, "ArrowRight");
    await press(wrapper, "-");
    expect(scale(wrapper)).toBe(1);
    expect(offsets(wrapper)).toEqual([0, 0]);
  });

  it("leaves Escape and Tab alone", () => {
    const wrapper = mountModal();
    const el = surface(wrapper).element;
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    el.dispatchEvent(escape);
    el.dispatchEvent(tab);
    expect(escape.defaultPrevented).toBe(false);
    expect(tab.defaultPrevented).toBe(false);
  });
});

describe("ImageModal touch", () => {
  it("pinch zooms while two fingers move", async () => {
    const wrapper = mountModal();
    await surface(wrapper).trigger("touchstart", { touches: touches(100) });
    await surface(wrapper).trigger("touchmove", { touches: touches(200) });
    expect(scale(wrapper)).toBe(2);
  });

  it("ignores a later two finger move once the touch ended", async () => {
    const wrapper = mountModal();
    await surface(wrapper).trigger("touchstart", { touches: touches(100) });
    await surface(wrapper).trigger("touchend", { touches: [] });
    await surface(wrapper).trigger("touchmove", { touches: touches(200) });
    expect(scale(wrapper)).toBe(1);
  });

  it("clears the pinch state on touchcancel too", async () => {
    const wrapper = mountModal();
    await surface(wrapper).trigger("touchstart", { touches: touches(100) });
    await surface(wrapper).trigger("touchcancel", { touches: [] });
    await surface(wrapper).trigger("touchmove", { touches: touches(200) });
    expect(scale(wrapper)).toBe(1);
  });
});

describe("ImageModal image", () => {
  it("uses the alt prop and falls back to the label", () => {
    const withAlt = mountModal({ alt: "Monty, photo of May 1" });
    expect(withAlt.find(".enlarged-image").attributes("alt")).toBe("Monty, photo of May 1");
    expect(mountModal().find(".enlarged-image").attributes("alt")).toBe("May 1");
  });

  it("resets zoom and offsets when the image changes", async () => {
    const wrapper = mountModal();
    await press(wrapper, "+");
    await press(wrapper, "ArrowLeft");
    await wrapper.setProps({ imageUrl: "/b.png" });
    expect(scale(wrapper)).toBe(1);
    expect(offsets(wrapper)).toEqual([0, 0]);
  });
});
