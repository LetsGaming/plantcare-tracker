import { describe, expect, it } from "vitest";
import {
  buildBatchEntries,
  buildRoundRows,
  rerankCandidates,
  resolveChecked,
  type RoundRow,
} from "@/utils/waterRound";
import type { WateringTone } from "@/utils/wateringStats";
import PlantMapper from "@/mapping/PlantMapping";
import { apiImageDto, apiPlantListItem, apiWateringSummary } from "@/tests/helpers";

const DAY = 86_400_000;
const now = 100 * DAY;

const plant = (
  id: number,
  name: string,
  watering: { daysAgo: number; interval?: number } | null,
  cover: APIImageDTO | null = null,
): PlantView =>
  PlantMapper.mapListItem(
    apiPlantListItem({
      plant_id: id,
      plant_name: name,
      cover,
      watering: apiWateringSummary(
        watering
          ? {
              last_watered_at: now - watering.daysAgo * DAY,
              avg_interval_days: watering.interval ?? 7,
            }
          : {},
      ),
    }),
  );

describe("buildRoundRows", () => {
  it("puts thirsty plants first and pre-ticks only them", () => {
    const rows = buildRoundRows(
      [
        plant(1, "Ok", { daysAgo: 1 }),
        plant(2, "Thirsty", { daysAgo: 20 }),
        plant(3, "Never", null),
      ],
      now,
    );
    expect(rows[0].name).toBe("Thirsty");
    expect(rows.find((r) => r.name === "Thirsty")!.preChecked).toBe(true);
    expect(rows.find((r) => r.name === "Ok")!.preChecked).toBe(false);
    expect(rows.find((r) => r.name === "Never")!.preChecked).toBe(true);
  });

  it("sorts a never watered plant after an overdue one and before a due one", () => {
    const rows = buildRoundRows(
      [
        plant(1, "Due", { daysAgo: 10 }),
        plant(2, "Never", null),
        plant(3, "Overdue", { daysAgo: 20 }),
      ],
      now,
    );
    expect(rows.map((r) => r.name)).toEqual(["Overdue", "Never", "Due"]);
    expect(rows[1].tone).toBe("new");
  });

  it("orders plants of equal rank by name", () => {
    const rows = buildRoundRows(
      [plant(1, "Beta", { daysAgo: 1 }), plant(2, "Alpha", { daysAgo: 1 })],
      now,
    );
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("reads the status from the summary and needs no records", () => {
    const [row] = buildRoundRows([plant(1, "A", { daysAgo: 20 })], now);
    expect(row.tone).toBe("overdue");
    expect(row.rank).toBeLessThan(0);
  });

  it("carries the cover image and the lower-cased name for the search", () => {
    const [row] = buildRoundRows([plant(1, "Monty", { daysAgo: 1 }, apiImageDto())], now);
    expect(row.image?.srcset).toContain("160w");
    expect(row.key).toBe("monty");
    expect(buildRoundRows([plant(2, "Bare", { daysAgo: 1 })], now)[0].image).toBeNull();
  });
});

describe("resolveChecked", () => {
  const rows = buildRoundRows(
    [plant(1, "Ok", { daysAgo: 1 }), plant(2, "Thirsty", { daysAgo: 20 })],
    now,
  );

  it("ticks the pre-ticked rows when nothing was touched", () => {
    expect([...resolveChecked(rows, new Map())]).toEqual([2]);
  });

  it("lets a touched row win over its pre-tick in both directions", () => {
    const checked = resolveChecked(
      rows,
      new Map([
        [1, true],
        [2, false],
      ]),
    );
    expect([...checked]).toEqual([1]);
  });
});

describe("buildBatchEntries", () => {
  const row = (plantId: number): RoundRow => ({
    plantId,
    name: "",
    key: "",
    image: null,
    tone: "ok",
    rank: 0,
    preChecked: false,
  });

  it("applies the round fertilizer unless a row overrides it", () => {
    expect(
      buildBatchEntries(
        [row(1), row(2), row(3), row(4)],
        new Set([1, 2, 4]),
        new Map<number, number | null>([
          [2, null],
          [3, 2],
          [4, 2],
        ]),
        1,
      ),
    ).toEqual([
      { plantId: 1, usedFertilizer: true, fertilizerTypeId: 1 },
      { plantId: 2, usedFertilizer: false, fertilizerTypeId: null },
      { plantId: 4, usedFertilizer: true, fertilizerTypeId: 2 },
    ]);
  });

  it("uses no fertilizer when the round has none", () => {
    expect(buildBatchEntries([row(1)], new Set([1]), new Map(), null)).toEqual([
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

  it("gives a never watered plant the same boost as a due one", () => {
    const out = rerankCandidates(
      [
        { plantId: 1, score: 0.82 },
        { plantId: 2, score: 0.8 },
      ],
      (id) => (id === 2 ? "new" : "ok"),
    );
    expect(out.map((c) => c.plantId)).toEqual([2, 1]);
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
