import { describe, it, expect } from "vitest";

const components = import.meta.glob("../**/*.vue", {
  query: "?raw",
  import: "default",
  eager: true,
});

const sourcesOutsideStores = import.meta.glob(
  ["../**/*.{ts,vue}", "!../stores/**", "!../tests/**", "!../**/*.d.ts"],
  { query: "?raw", import: "default", eager: true },
);

const DIRECT_STORE_WRITES = [
  /use\w+Store\([^)]*\)(\.\w+|\[[^\]]+\])+\s*([-+*/]?=[^=]|\+\+|--)/,
  /this\.\w+Store(\.\w+)+\s*([-+*/]?=[^=]|\+\+|--)/,
  /use\w+Store\([^)]*\)(\.\w+)+\.(push|splice|pop|shift|unshift|sort|reverse)\(/,
];

describe("store conventions", () => {
  it("finds the sources it checks", () => {
    expect(Object.keys(sourcesOutsideStores).length).toBeGreaterThan(50);
  });

  it("changes store state only through store actions", () => {
    const offenders = Object.entries(sourcesOutsideStores)
      .filter(([, source]) => DIRECT_STORE_WRITES.some((pattern) => pattern.test(source as string)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it("detects direct writes, compound assignments and mutating calls", () => {
    const writes = [
      "usePlantsStore().items = []",
      "useSalesStore().filters.q = 'x'",
      "useWateringStore()['byPlant'] = {}",
      "useCalendarStore().count += 1",
      "useCalendarStore().count++",
      "this.plantsStore.items = []",
      "this.salesStore.filters.q -= 1",
      "usePlantsStore().items.push(plant)",
      "usePlantsStore(pinia).items.sort()",
    ];
    const reads = [
      "usePlantsStore().items === []",
      "this.plantsStore.items !== null",
      "usePlantsStore().items.slice().sort()",
      "this.plantsStore.setItems([])",
    ];
    const matches = (line: string) => DIRECT_STORE_WRITES.some((pattern) => pattern.test(line));
    expect(writes.filter((line) => !matches(line))).toEqual([]);
    expect(reads.filter(matches)).toEqual([]);
  });
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
      .filter(([, source]) => /@\/utils\/(apiUtils|tokenUtils)/.test(source as string))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
