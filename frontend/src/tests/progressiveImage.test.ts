import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import ProgressiveImage from "@/components/ProgressiveImage.vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import { placeholderArt, placeholderClass, placeholderSpec } from "@/components/ui/placeholderArt";

const image: ImageView = Object.freeze({
  id: 1,
  url: "/uploads/a.webp",
  srcset: "/uploads/a-160.webp 160w, /uploads/a-480.webp 480w, /uploads/a.webp 1024w",
  width: 1024,
  height: 768,
  placeholder: "#336699",
  dateMs: 0,
});

const mountImage = (props: Record<string, unknown> = {}) =>
  mount(ProgressiveImage, {
    props: { image, sizes: "50vw", alt: "Monty", ...props },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProgressiveImage markup", () => {
  it("renders exactly one img and never constructs window.Image", () => {
    const construct = vi.fn();
    vi.stubGlobal("Image", construct);
    const wrapper = mountImage();
    expect(wrapper.findAll("img")).toHaveLength(1);
    expect(wrapper.find("ion-img").exists()).toBe(false);
    expect(construct).not.toHaveBeenCalled();
  });

  it("renders srcset, sizes, width, height, lazy loading and async decoding", () => {
    const img = mountImage().find("img");
    expect(img.attributes("src")).toBe(image.url);
    expect(img.attributes("srcset")).toBe(image.srcset);
    expect(img.attributes("sizes")).toBe("50vw");
    expect(img.attributes("width")).toBe("1024");
    expect(img.attributes("height")).toBe("768");
    expect(img.attributes("loading")).toBe("lazy");
    expect(img.attributes("decoding")).toBe("async");
    expect(img.attributes("fetchpriority")).toBeUndefined();
    expect(img.attributes("alt")).toBe("Monty");
  });

  it("does not leak image, sizes or priority onto the root element", () => {
    const wrapper = mountImage({ priority: true });
    const root = wrapper.element as HTMLElement;
    for (const name of ["image", "sizes", "priority"]) expect(root.hasAttribute(name)).toBe(false);
  });

  it("loads a priority image eagerly with high fetch priority", () => {
    const img = mountImage({ priority: true }).find("img");
    expect(img.attributes("loading")).toBe("eager");
    expect(img.attributes("fetchpriority")).toBe("high");
  });

  it("reserves the aspect ratio of the image and falls back to 4 / 3", () => {
    const ratio = (wrapper: ReturnType<typeof mountImage>) =>
      (wrapper.vm as unknown as { aspectRatio: string }).aspectRatio;
    expect(ratio(mountImage())).toBe("1024 / 768");
    expect(ratio(mountImage({ image: null, src: "https://shop.test/a.jpg" }))).toBe("4 / 3");
    expect(ratio(mountImage({ image: { ...image, width: null, height: null } }))).toBe("4 / 3");
  });

  it("renders a plain src without srcset, sizes or dimensions", () => {
    const wrapper = mountImage({ image: null, src: "https://shop.test/a.jpg" });
    const img = wrapper.find("img");
    expect(wrapper.findAll("img")).toHaveLength(1);
    expect(img.attributes("src")).toBe("https://shop.test/a.jpg");
    expect(img.attributes("srcset")).toBeUndefined();
    expect(img.attributes("sizes")).toBeUndefined();
    expect(img.attributes("width")).toBeUndefined();
    expect(img.attributes("loading")).toBe("lazy");
  });

  it("renders no img when there is no source", () => {
    const wrapper = mountImage({ image: null, src: "" });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.findAll(".placeholder")).toHaveLength(1);
  });
});

describe("ProgressiveImage placeholder", () => {
  it("keeps the placeholder mounted until and after the load", async () => {
    const wrapper = mountImage();
    expect(wrapper.find(".placeholder").exists()).toBe(true);
    expect(wrapper.find("img").classes()).not.toContain("is-loaded");
    await wrapper.find("img").trigger("load");
    expect(wrapper.find("img").classes()).toContain("is-loaded");
    expect(wrapper.find(".placeholder").exists()).toBe(true);
  });

  it("keeps the placeholder and drops the img when the image fails", async () => {
    const wrapper = mountImage();
    await wrapper.find("img").trigger("error");
    expect(wrapper.find("img").exists()).toBe(false);
    const placeholder = wrapper.find(".placeholder");
    expect(placeholder.exists()).toBe(true);
    expect(placeholder.attributes("aria-label")).toBe("Monty");
  });

  it("tries again when the source changes after a failure", async () => {
    const wrapper = mountImage();
    await wrapper.find("img").trigger("error");
    await wrapper.setProps({ image: { ...image, url: "/uploads/b.webp" } });
    expect(wrapper.find("img").attributes("src")).toBe("/uploads/b.webp");
    expect(wrapper.find("img").classes()).not.toContain("is-loaded");
  });

  it("renders one placeholder element without child nodes and hides it from assistive tech", () => {
    const wrapper = mountImage();
    const placeholders = wrapper.findAll(".placeholder");
    expect(placeholders).toHaveLength(1);
    expect(placeholders[0].element.children).toHaveLength(0);
    expect(placeholders[0].attributes("aria-hidden")).toBe("true");
  });

  it("shows the dominant colour of the image behind it as a flat background", () => {
    const wrapper = mountImage();
    expect(wrapper.findComponent(PlantPlaceholder).props("color")).toBe("#336699");
    const el = wrapper.find(".placeholder").element as HTMLElement;
    expect(el.style.backgroundColor).not.toBe("");
    expect(el.style.backgroundImage).toBe("none");
  });

  it("draws the baked art through a shared class, not inline URIs", () => {
    const wrapper = mountImage({ image: null, src: "", kind: "substrate", seed: "7" });
    const placeholder = wrapper.find(".placeholder");
    const { tint, variant } = placeholderSpec("substrate", "7");
    expect(placeholder.classes()).toContain(placeholderClass("substrate", variant, tint));
    expect(placeholder.attributes("style") ?? "").not.toContain("data:image");
    expect((placeholder.attributes("style") ?? "").length).toBeLessThan(100);
    const css = document.head.querySelector("style[data-placeholder-art]")?.textContent ?? "";
    expect(css).toContain(`.${placeholderClass("substrate", variant, tint)}{`);
    expect(css).toContain(".ion-palette-dark .ph-substrate-");
  });

  it("injects each class rule once", () => {
    const name = placeholderClass("component", 1, 2);
    const count = () =>
      (document.head.querySelector("style[data-placeholder-art]")?.textContent ?? "").split(
        `.${name}{background-color`,
      ).length - 1;
    expect(count()).toBe(1);
    placeholderClass("component", 1, 2);
    expect(count()).toBe(1);
  });

  it("hides the placeholder once the photo has loaded", async () => {
    const wrapper = mountImage();
    expect(wrapper.find(".placeholder").classes()).not.toContain("covered");
    await wrapper.find("img").trigger("load");
    expect(wrapper.find(".placeholder").classes()).toContain("covered");
  });

  it("shows the art instead of the flat colour after the image failed", async () => {
    const wrapper = mountImage();
    await wrapper.find("img").trigger("load");
    await wrapper.find("img").trigger("error");
    const placeholder = wrapper.find(".placeholder");
    expect(wrapper.findComponent(PlantPlaceholder).props("color")).toBe("");
    expect(placeholder.classes()).not.toContain("covered");
    expect(placeholder.classes().some((name) => name.startsWith("ph-"))).toBe(true);
    expect((placeholder.element as HTMLElement).style.backgroundImage).not.toBe("none");
  });
});

describe("ProgressiveImage load state", () => {
  it("is loaded at mount without a load event when the image is already cached", async () => {
    const complete = vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    const width = vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1024);
    const wrapper = mountImage();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("img").classes()).toContain("is-loaded");
    complete.mockRestore();
    width.mockRestore();
  });

  it("is not loaded at mount for an incomplete image", () => {
    expect(mountImage().find("img").classes()).not.toContain("is-loaded");
  });

  it("drops is-loaded when the url changes", async () => {
    const wrapper = mountImage();
    await wrapper.find("img").trigger("load");
    expect(wrapper.find("img").classes()).toContain("is-loaded");
    await wrapper.setProps({ image: { ...image, url: "/uploads/b.webp" } });
    expect(wrapper.find("img").classes()).not.toContain("is-loaded");
  });

  it("sends no referrer for third-party src-only images but not for server images", () => {
    expect(mountImage().find("img").attributes("referrerpolicy")).toBeUndefined();
    const thirdParty = mountImage({ image: null, src: "https://shop.test/a.jpg" });
    expect(thirdParty.find("img").attributes("referrerpolicy")).toBe("no-referrer");
  });
});

describe("ProgressiveImage motion", () => {
  const stubMotion = (reduce: boolean) =>
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: reduce && query.includes("prefers-reduced-motion"),
      media: query,
    }));

  it("fades in by default", () => {
    stubMotion(false);
    expect(mountImage().find("img").classes()).toContain("fade");
  });

  it("drops the fade under prefers-reduced-motion", () => {
    stubMotion(true);
    expect(mountImage().find("img").classes()).not.toContain("fade");
  });
});

describe("placeholderArt", () => {
  it("builds one data URI per kind, variant, tint and theme and reuses it", () => {
    const light = placeholderArt("plant", 0, 1, "light");
    expect(light.startsWith('url("data:image/svg+xml,')).toBe(true);
    expect(placeholderArt("plant", 0, 1, "light")).toBe(light);
    expect(placeholderArt("plant", 0, 1, "dark")).not.toBe(light);
    expect(placeholderArt("plant", 1, 1, "light")).not.toBe(light);
    expect(placeholderArt("plant", 0, 2, "light")).not.toBe(light);
    expect(placeholderArt("sale", 0, 1, "light")).not.toBe(light);
  });

  it("derives a stable tint and drawing from the seed", () => {
    const spec = placeholderSpec("plant", "42");
    expect(placeholderSpec("plant", "42")).toEqual(spec);
    expect(spec.tint).toBeGreaterThanOrEqual(1);
    expect(spec.tint).toBeLessThanOrEqual(5);
    expect(spec.variant).toBeGreaterThanOrEqual(0);
    expect(spec.variant).toBeLessThanOrEqual(2);
  });
});
