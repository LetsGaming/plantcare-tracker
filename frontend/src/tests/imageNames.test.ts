import { describe, expect, it } from "vitest";

const sources = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const source = (name: string): string => {
  const entry = Object.entries(sources).find(([file]) => file.endsWith(name));
  if (!entry) throw new Error(`missing ${name}`);
  return entry[1];
};

describe("image accessible names", () => {
  it("scans the whole component tree", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("hides the gallery date caption because the image alt already carries it", () => {
    expect(source("HorizontalGallery.vue")).toMatch(
      /<span[^>]*class="image-date"[^>]*aria-hidden="true"/,
    );
  });

  it("gives the enlarged image the full gallery alt", () => {
    expect(source("HorizontalGallery.vue")).toContain(':alt="altFor(enlargedImage)"');
  });

  it("leaves the plant card image decorative inside the named button", () => {
    const overview = source("ItemsOverview.vue");
    const card = /<progressive-image[^>]*>/s.exec(overview)?.[0] ?? "";
    expect(card).toMatch(/\salt=""/);
    expect(overview).toContain('class="tag-name"');
  });
});
