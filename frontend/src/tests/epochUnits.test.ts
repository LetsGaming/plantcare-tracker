import { describe, expect, it } from "vitest";
import { toEpochMillis } from "@/utils/epochUnits";

describe("toEpochMillis", () => {
  it("scales epoch seconds to milliseconds", () => {
    expect(toEpochMillis(1_700_000_000)).toBe(1_700_000_000_000);
  });

  it("keeps epoch milliseconds", () => {
    expect(toEpochMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("treats the boundary as milliseconds", () => {
    expect(toEpochMillis(1e11)).toBe(1e11);
    expect(toEpochMillis(1e11 - 1)).toBe((1e11 - 1) * 1000);
  });
});
