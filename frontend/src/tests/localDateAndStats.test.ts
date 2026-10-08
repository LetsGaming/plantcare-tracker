import { describe, it, expect } from "vitest";
import { calendarDaysBetween, dayKeyToMillis, parseDayKey, toDayKey } from "@/utils/localDate";
import {
  averageIntervalDays,
  describeInterval,
  latestWateringMillis,
  relativeDaysText,
} from "@/utils/wateringStats";

const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

describe("local day keys", () => {
  it("uses local date parts, not UTC", () => {
    expect(toDayKey(new Date(2026, 4, 3, 0, 30))).toBe("2026-05-03");
    expect(toDayKey(new Date(2026, 4, 3, 23, 30))).toBe("2026-05-03");
  });

  it("parses keys and rejects junk", () => {
    expect(parseDayKey("2026-05-03T10:00:00Z")).toEqual({ year: 2026, month: 5, day: 3 });
    expect(parseDayKey("nope")).toBeNull();
  });

  it("stores the current instant for today and local noon for another day", () => {
    const now = local(2026, 5, 3, 9);
    expect(dayKeyToMillis("2026-05-03", now)).toBe(now);
    const other = dayKeyToMillis("2026-04-20", now);
    expect(toDayKey(other)).toBe("2026-04-20");
    expect(new Date(other).getHours()).toBe(12);
  });

  it("counts calendar days regardless of time of day", () => {
    expect(calendarDaysBetween(local(2026, 5, 1, 23), local(2026, 5, 2, 1))).toBe(1);
    expect(calendarDaysBetween(local(2026, 5, 3, 1), local(2026, 5, 3, 23))).toBe(0);
  });
});

describe("watering stats", () => {
  const rec = (y: number, m: number, d: number) => ({ date_millis: local(y, m, d) });

  it("finds the latest record", () => {
    expect(latestWateringMillis([])).toBeNull();
    expect(latestWateringMillis([rec(2026, 5, 1), rec(2026, 5, 9)])).toBe(local(2026, 5, 9));
  });

  it("averages gaps between distinct days", () => {
    expect(averageIntervalDays([rec(2026, 5, 1)])).toBeNull();
    expect(averageIntervalDays([rec(2026, 5, 1), rec(2026, 5, 4), rec(2026, 5, 7)])).toBe(3);
    expect(averageIntervalDays([rec(2026, 5, 1), rec(2026, 5, 1), rec(2026, 5, 3)])).toBe(2);
  });

  it("picks a readable unit", () => {
    expect(describeInterval(0.2)).toEqual({ unit: "days", count: 1 });
    expect(describeInterval(14)).toEqual({ unit: "weeks", count: 2 });
    expect(describeInterval(60)).toEqual({ unit: "months", count: 2 });
    expect(describeInterval(400)).toEqual({ unit: "years", count: 1 });
  });

  it("phrases relative time in the locale", () => {
    expect(relativeDaysText(3, "en")).toBe("3 days ago");
    expect(relativeDaysText(3, "de")).toBe("vor 3 Tagen");
    expect(relativeDaysText(0, "en")).toBe("today");
  });
});
