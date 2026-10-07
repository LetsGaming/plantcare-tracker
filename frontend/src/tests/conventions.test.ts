import { describe, it, expect } from "vitest";

const components = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("component conventions", () => {
  it("finds the components it checks", () => {
    expect(Object.keys(components).length).toBeGreaterThan(20);
  });

  it("uses the Options API: no <script setup> anywhere", () => {
    const offenders = Object.entries(components)
      .filter(([, source]) => /<script\s+[^>]*\bsetup\b/.test(source as string))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("keeps views and components off the transport layer", () => {
    const offenders = Object.entries(components)
      .filter(([path]) => !path.endsWith("views/Debug.vue"))
      .filter(([, source]) => /@\/utils\/(apiUtils|tokenUtils)/.test(source as string))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
