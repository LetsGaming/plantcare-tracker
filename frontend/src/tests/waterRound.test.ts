import { describe, expect, it } from "vitest";
import {
  buildBatchEntries,
  buildRoundRows,
  rerankCandidates,
  type RoundRow,
} from "@/utils/waterRound";
import type { WateringTone } from "@/utils/wateringStats";

const DAY = 86_400_000;
const now = 100 * DAY;
const plant = (id: number, name: string) => ({ id, name, images: [] }) as unknown as Plant;
const rec = (daysAgo: number) => ({ date_millis: now - daysAgo * DAY }) as WateringRecord;

describe("buildRoundRows", () => {
  it("puts thirsty plants first and pre-ticks only them", () => {
    const history: Record<number, WateringRecord[]> = {
      1: [rec(1), rec(8)],
      2: [rec(20), rec(27)],
      3: [],
    };
    const rows = buildRoundRows(
      [plant(1, "Ok"), plant(2, "Thirsty"), plant(3, "Never")],
      (id) => history[id],
      now,
    );
    expect(rows[0].name).toBe("Thirsty");
    expect(rows.find((r) => r.name === "Thirsty")!.checked).toBe(true);
    expect(rows.find((r) => r.name === "Ok")!.checked).toBe(false);
    expect(rows.find((r) => r.name === "Never")!.checked).toBe(false);
  });

  it("orders plants of equal rank by name", () => {
    const rows = buildRoundRows([plant(1, "Beta"), plant(2, "Alpha")], () => [], now);
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("leaves the fertilizer following the round", () => {
    const [row] = buildRoundRows([plant(1, "A")], () => [], now);
    expect(row.fertilizerTypeId).toBeUndefined();
  });
});

describe("buildBatchEntries", () => {
  const row = (
    plantId: number,
    checked: boolean,
    fertilizerTypeId: number | null | undefined,
  ): RoundRow => ({ plantId, name: "", tone: "ok", rank: 0, checked, fertilizerTypeId });

  it("applies the round fertilizer unless a row overrides it", () => {
    expect(
      buildBatchEntries(
        [row(1, true, undefined), row(2, true, null), row(3, false, 2), row(4, true, 2)],
        1,
      ),
    ).toEqual([
      { plantId: 1, usedFertilizer: true, fertilizerTypeId: 1 },
      { plantId: 2, usedFertilizer: false, fertilizerTypeId: null },
      { plantId: 4, usedFertilizer: true, fertilizerTypeId: 2 },
    ]);
  });

  it("uses no fertilizer when the round has none", () => {
    expect(buildBatchEntries([row(1, true, undefined)], null)).toEqual([
      { plantId: 1, usedFertilizer: false, fertilizerTypeId: null },
    ]);
  });
});

describe("rerankCandidates", () => {
  it("lets an overdue plant overtake a slightly better ok plant and keeps three", () => {
    const tones: Record<number, WateringTone> = { 1: "ok", 2: "overdue" };
    const out = rerankCandidates(
      [
        { plantId: 1, score: 0.82 },
        { plantId: 2, score: 0.8 },
        { plantId: 3, score: 0.5 },
        { plantId: 4, score: 0.4 },
      ],
      (id) => tones[id],
    );
    expect(out.map((c) => c.plantId)).toEqual([2, 1, 3]);
    expect(out[0].score).toBe(0.8);
  });

  it("does not let a due plant overtake a clearly better ok plant", () => {
    const out = rerankCandidates(
      [
        { plantId: 1, score: 0.9 },
        { plantId: 2, score: 0.8 },
      ],
      (id) => (id === 2 ? "due" : "ok"),
    );
    expect(out.map((c) => c.plantId)).toEqual([1, 2]);
  });
});
