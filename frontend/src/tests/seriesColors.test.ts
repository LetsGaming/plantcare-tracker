import { describe, expect, it } from "vitest";
import { SERIES_SIZE, seriesSlots } from "@/utils/seriesColors";

describe("seriesSlots", () => {
  it("cycles through the palette in order", () => {
    expect(seriesSlots(4)).toEqual([0, 1, 2, 3]);
    expect(seriesSlots(5)).toEqual([0, 1, 2, 3, 4]);
  });

  it("shifts the last slice when it would repeat the first", () => {
    for (const count of [6, 11, 16]) {
      const slots = seriesSlots(count);
      expect(slots[count - 1]).not.toBe(slots[0]);
      expect(slots[count - 1]).not.toBe(slots[count - 2]);
    }
  });

  it("leaves every other count untouched and handles tiny lists", () => {
    expect(seriesSlots(7)).toEqual([0, 1, 2, 3, 4, 0, 1]);
    expect(seriesSlots(1)).toEqual([0]);
    expect(seriesSlots(0)).toEqual([]);
    expect(Math.max(...seriesSlots(12))).toBeLessThan(SERIES_SIZE);
  });
});
