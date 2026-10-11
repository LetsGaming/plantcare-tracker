import { describe, it, expect } from "vitest";
import {
  NEW_PLANT_RANK,
  DEFAULT_WATERING_INTERVAL_DAYS,
  wateringStatus,
} from "@/utils/wateringStats";

const DAY = 86400000;
const now = new Date("2026-06-30T12:00:00").getTime();
const daysAgo = (n: number) => ({ date_millis: now - n * DAY });

describe("wateringStatus", () => {
  it("never watered plants are new and ranked between overdue and due", () => {
    expect(wateringStatus([], now)).toMatchObject({
      daysSince: null,
      tone: "new",
      rank: NEW_PLANT_RANK,
    });
    expect(NEW_PLANT_RANK).toBe(-(DEFAULT_WATERING_INTERVAL_DAYS + 1.5));
  });

  it("sorts overdue, then new, then merely late, then ok", () => {
    const overdue = wateringStatus([daysAgo(20)], now);
    const fresh = wateringStatus([], now);
    const late = wateringStatus([daysAgo(10)], now);
    const fine = wateringStatus([daysAgo(1)], now);
    expect(overdue.tone).toBe("overdue");
    expect(late.tone).toBe("due");
    expect(overdue.rank).toBeLessThan(fresh.rank);
    expect(fresh.rank).toBeLessThan(late.rank);
    expect(late.rank).toBeLessThan(fine.rank);
  });

  it("keeps the new rank for plants whose own rhythm is not known", () => {
    expect(wateringStatus([], now).intervalDays).toBe(DEFAULT_WATERING_INTERVAL_DAYS);
    expect(wateringStatus([daysAgo(8)], now).rank).toBeGreaterThan(NEW_PLANT_RANK);
  });

  it("uses the 7 day default with fewer than two watering days", () => {
    expect(wateringStatus([daysAgo(7)], now).tone).toBe("ok");
    expect(wateringStatus([daysAgo(8)], now).tone).toBe("due");
    expect(wateringStatus([daysAgo(15)], now).tone).toBe("overdue");
  });

  it("uses the plant's own rhythm when known", () => {
    const records = [daysAgo(23), daysAgo(20), daysAgo(17), daysAgo(14), daysAgo(11), daysAgo(8)];
    const status = wateringStatus(records, now);
    expect(status.intervalDays).toBe(3);
    expect(status.daysSince).toBe(8);
    expect(status.tone).toBe("overdue");
    expect(wateringStatus([daysAgo(8), daysAgo(5), daysAgo(2)], now).tone).toBe("ok");
    expect(wateringStatus([daysAgo(9), daysAgo(6), daysAgo(3)], now).tone).toBe("due");
  });

  it("ranks the more overdue plant first", () => {
    const a = wateringStatus([daysAgo(30)], now);
    const b = wateringStatus([daysAgo(10)], now);
    expect(a.rank).toBeLessThan(b.rank);
    expect(b.rank).toBeLessThan(0);
  });
});
