/**
 * wateringStatus from a plant's watering summary must match the records-based
 * result. The server derives `avg_interval_days` with one fixed UTC offset while
 * the records path uses each record's own local offset, so every fixture keeps
 * its records at local noon and away from DST changes (late April to May).
 */

import { describe, it, expect } from "vitest";
import { wateringStatus, NEW_PLANT_RANK } from "@/utils/wateringStats";
import WateringMapper from "@/mapping/WateringMapping";

const day = (daysAgo: number): number => new Date(2026, 4, 20 - daysAgo, 12).getTime();
const now = new Date(2026, 4, 20, 18).getTime();

const records = (...daysAgo: number[]) => daysAgo.map((ago) => ({ date_millis: day(ago) }));

const summary = (lastDaysAgo: number | null, avgIntervalDays: number | null): WateringSummary =>
  WateringMapper.mapSummary({
    last_watered_at: lastDaysAgo === null ? null : day(lastDaysAgo),
    last_fertilized_at: null,
    avg_interval_days: avgIntervalDays,
  });

interface Fixture {
  name: string;
  records: { date_millis: number }[];
  summary: WateringSummary;
  tone: "new" | "ok" | "due" | "overdue";
}

const fixtures: Fixture[] = [
  { name: "never watered", records: [], summary: summary(null, null), tone: "new" },
  {
    name: "watered daily, last today",
    records: records(4, 3, 2, 1, 0),
    summary: summary(0, 1),
    tone: "ok",
  },
  {
    name: "watered daily, last four days ago",
    records: records(8, 7, 6, 5, 4),
    summary: summary(4, 1),
    tone: "overdue",
  },
  {
    name: "watered weekly, last three days ago",
    records: records(17, 10, 3),
    summary: summary(3, 7),
    tone: "ok",
  },
  {
    name: "watered weekly, due",
    records: records(22, 15, 8),
    summary: summary(8, 7),
    tone: "due",
  },
  {
    name: "watered weekly, overdue",
    records: records(30, 23, 16),
    summary: summary(16, 7),
    tone: "overdue",
  },
  {
    name: "single watering within the default interval",
    records: records(7),
    summary: summary(7, null),
    tone: "ok",
  },
  {
    name: "single watering, due against the default interval",
    records: records(8),
    summary: summary(8, null),
    tone: "due",
  },
  {
    name: "single watering, overdue against the default interval",
    records: records(20),
    summary: summary(20, null),
    tone: "overdue",
  },
  {
    name: "uneven rhythm with two records on one day",
    records: [...records(10, 6, 1), { date_millis: day(6) + 3_600_000 }],
    summary: summary(1, 4.5),
    tone: "ok",
  },
  {
    name: "uneven rhythm, due",
    records: records(14, 9, 5),
    summary: summary(5, 4.5),
    tone: "due",
  },
];

describe("wateringStatus(summary)", () => {
  for (const fixture of fixtures) {
    it(`equals the records-based status: ${fixture.name}`, () => {
      const fromSummary = wateringStatus(fixture.summary, now);
      expect(fromSummary).toEqual(wateringStatus(fixture.records, now));
      expect(fromSummary.tone).toBe(fixture.tone);
    });
  }

  it("treats a missing summary (plants of others) as never watered", () => {
    expect(wateringStatus(null, now)).toEqual(wateringStatus([], now));
    expect(wateringStatus(undefined, now)).toMatchObject({
      daysSince: null,
      tone: "new",
      rank: NEW_PLANT_RANK,
    });
  });

  it("ignores the fertilizer date", () => {
    const fertilized = WateringMapper.mapSummary({
      last_watered_at: day(8),
      last_fertilized_at: day(0),
      avg_interval_days: 7,
    });
    expect(wateringStatus(fertilized, now)).toEqual(wateringStatus(summary(8, 7), now));
  });
});
