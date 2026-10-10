/// <reference types="node" />
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, VueWrapper } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (key: string) => key, getLocale: () => "en" },
}));

import Calendar from "@/components/calendar/Calendar.vue";
import { useCalendarStore } from "@/stores/calendar";
import { ensureContrast } from "@/utils/contrast";

const NONE = "watering.category.no_fertilizer";
const ORGANIC = "watering.category.organic";
const MINERAL = "watering.category.mineral";

const root = document.documentElement;
const TOKENS = ["--water", "--feed-organic", "--feed-mineral", "--ion-background-color"];

const now = new Date();
const dayKey = (day: number): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const entry = (day: number, name: string): CalendarDates => ({
  date: dayKey(day),
  category: { name, textColor: "", backgroundColor: "" },
});

const wateringDates: CalendarDates[] = [
  entry(3, NONE),
  entry(4, ORGANIC),
  entry(5, MINERAL),
  entry(6, NONE),
  entry(6, ORGANIC),
  entry(7, ORGANIC),
  entry(7, MINERAL),
  entry(7, NONE),
];

const setTokens = (values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
};

const mountCalendar = (
  props: Record<string, unknown>,
  wateringCategories?: Category[],
): VueWrapper => {
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const store = useCalendarStore(pinia);
  if (wateringCategories) store.wateringCategories = wateringCategories;
  return mount(Calendar, {
    props,
    global: { plugins: [pinia], stubs: { Popover: true, IconButton: true } },
  });
};

const cell = (wrapper: VueWrapper, day: number): HTMLElement =>
  wrapper.get(`[data-day="${dayKey(day)}"]`).element as HTMLElement;

const markerBg = (wrapper: VueWrapper, day: number): string =>
  cell(wrapper, day).style.getPropertyValue("--marker-bg");

const legend = (wrapper: VueWrapper) =>
  wrapper.findAll(".legend-item").map((item) => {
    const swatch = item.get(".swatch").element as HTMLElement;
    return {
      label: item.text(),
      shape: [...swatch.classList].find((c) => c.startsWith("swatch-") && c !== "swatch"),
      color: swatch.style.getPropertyValue("--swatch"),
    };
  });

beforeEach(() => {
  root.classList.remove("ion-palette-dark");
  setTokens({
    "--water": "#2266aa",
    "--feed-organic": "#7a5230",
    "--feed-mineral": "#5b3f99",
    "--ion-background-color": "#ffffff",
  });
});

afterEach(() => {
  for (const name of TOKENS) root.style.removeProperty(name);
  root.classList.remove("ion-palette-dark");
});

describe("Calendar watering markers", () => {
  it("marks plain, organic and mineral days with distinct classes", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();

    const kinds = (day: number) =>
      ["is-water", "is-organic", "is-mineral"].filter((c) =>
        cell(wrapper, day).classList.contains(c),
      );
    expect(kinds(3)).toEqual(["is-water"]);
    expect(kinds(4)).toEqual(["is-organic"]);
    expect(kinds(5)).toEqual(["is-mineral"]);
    expect(kinds(6)).toEqual(["is-organic"]);
    expect(kinds(7)).toEqual(["is-mineral"]);
    expect(cell(wrapper, 8).classList.contains("is-water")).toBe(false);
    wrapper.unmount();
  });

  it("announces organic and mineral days distinctly", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();
    expect(cell(wrapper, 3).getAttribute("aria-label")).toBe("plantdetail.day_watered");
    expect(cell(wrapper, 4).getAttribute("aria-label")).toBe("plantdetail.day_organic");
    expect(cell(wrapper, 5).getAttribute("aria-label")).toBe("plantdetail.day_mineral");
    wrapper.unmount();
  });

  it("uses the role tokens when the category colors are empty", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();
    expect(markerBg(wrapper, 3)).toBe("#2266aa");
    expect(markerBg(wrapper, 4)).toBe("#7a5230");
    expect(markerBg(wrapper, 5)).toBe("#5b3f99");
    expect(cell(wrapper, 3).style.getPropertyValue("--marker-fg")).toBe("#ffffff");
    wrapper.unmount();
  });

  it("lifts a custom category color that fails 3:1 against the page", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates }, [
      { name: NONE, textColor: "", backgroundColor: "#ffff66" },
      { name: ORGANIC, textColor: "", backgroundColor: "#0a5c2e" },
      { name: MINERAL, textColor: "", backgroundColor: "" },
    ]);
    await flushPromises();
    const lifted = ensureContrast("#ffff66", "#ffffff", 3);
    expect(lifted).not.toBe("#ffff66");
    expect(markerBg(wrapper, 3)).toBe(lifted);
    expect(markerBg(wrapper, 4)).toBe("#0a5c2e");
    expect(markerBg(wrapper, 5)).toBe("#5b3f99");
    wrapper.unmount();
  });

  it("re-reads the tokens when the theme changes", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();
    expect(markerBg(wrapper, 3)).toBe("#2266aa");

    setTokens({ "--water": "#88bbee", "--ion-background-color": "#101814" });
    root.classList.add("ion-palette-dark");
    await flushPromises();
    expect(markerBg(wrapper, 3)).toBe("#88bbee");

    setTokens({ "--water": "#2266aa", "--ion-background-color": "#ffffff" });
    root.classList.remove("ion-palette-dark");
    await flushPromises();
    expect(markerBg(wrapper, 3)).toBe("#2266aa");
    wrapper.unmount();
  });

  it("re-reads a role token even when the page color stays the same", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();
    setTokens({ "--feed-mineral": "#3d2a66" });
    root.classList.add("ion-palette-dark");
    await flushPromises();
    expect(markerBg(wrapper, 5)).toBe("#3d2a66");
    expect(legend(wrapper)[2].color).toBe("#3d2a66");
    wrapper.unmount();
  });

  it("lists watered, organic, mineral and today in the legend with the marker colors", async () => {
    const wrapper = mountCalendar({ markerMode: "watering", dates: wateringDates });
    await flushPromises();
    expect(legend(wrapper)).toEqual([
      { label: "plantdetail.legend_watered", shape: "swatch-fill", color: "#2266aa" },
      { label: "plantdetail.legend_organic", shape: "swatch-ring", color: "#7a5230" },
      { label: "plantdetail.legend_mineral", shape: "swatch-dashed", color: "#5b3f99" },
      { label: "plantdetail.legend_today", shape: "swatch-today", color: "var(--ion-text-color)" },
    ]);
    wrapper.unmount();
  });
});

describe("Calendar marker styles", () => {
  const source = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
  const ruleBody = (css: string, selector: string): string => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  };

  it("draws organic as a solid ring and mineral as a dashed ring", () => {
    const calendar = source("components/calendar/Calendar.vue");
    expect(ruleBody(calendar, ".is-water .day-number")).toMatch(/background:\s*var\(--marker-bg\)/);
    expect(ruleBody(calendar, ".is-organic .day-number")).toMatch(
      /border:\s*3px solid var\(--marker-bg\)/,
    );
    expect(ruleBody(calendar, ".is-mineral .day-number")).toMatch(
      /border:\s*3px dashed var\(--marker-bg\)/,
    );
  });

  it("offers a dashed legend swatch", () => {
    expect(ruleBody(source("components/calendar/CalendarLegend.vue"), ".swatch-dashed")).toMatch(
      /border:\s*3px dashed var\(--swatch\)/,
    );
  });
});

describe("Calendar category markers", () => {
  it("paints legend swatches with the same resolved colors as the markers", async () => {
    const wrapper = mountCalendar({
      dates: [
        {
          date: dayKey(9),
          category: { name: "Repot", textColor: "", backgroundColor: "#ffff66" },
        },
      ],
    });
    await flushPromises();
    const lifted = ensureContrast("#ffff66", "#ffffff", 3);
    expect(cell(wrapper, 9).classList.contains("is-custom")).toBe(true);
    expect(markerBg(wrapper, 9)).toBe(lifted);
    expect(legend(wrapper)).toEqual([{ label: "Repot", shape: "swatch-fill", color: lifted }]);
    wrapper.unmount();
  });
});
