import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

import ProgressiveImage from "@/components/ProgressiveImage.vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import { placeholderArt, placeholderSpec } from "@/components/ui/placeholderArt";

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

  it("shows the dominant colour of the image behind it", () => {
    const wrapper = mountImage();
    expect(wrapper.findComponent(PlantPlaceholder).props("color")).toBe("#336699");
  });

  it("draws the baked art when there is no image colour", () => {
    const wrapper = mountImage({ image: null, src: "", kind: "substrate", seed: "7" });
    const style = wrapper.find(".placeholder").attributes("style") ?? "";
    expect(style).toContain("--art-light");
    expect(style).toContain("--art-dark");
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
