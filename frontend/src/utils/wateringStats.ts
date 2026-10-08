import { calendarDaysBetween, toDayKey } from "./localDate";

export type IntervalUnit = "days" | "weeks" | "months" | "years";

export const latestWateringMillis = (records: { date_millis: number }[]): number | null =>
  records.length === 0 ? null : Math.max(...records.map((record) => record.date_millis));

/** Mean gap in days between distinct watering days; null with fewer than two such days. */
export const averageIntervalDays = (records: { date_millis: number }[]): number | null => {
  const days = [...new Set(records.map((record) => toDayKey(record.date_millis)))].sort();
  if (days.length < 2) return null;
  const millis = days.map((key) => new Date(`${key}T12:00:00`).getTime());
  const total = calendarDaysBetween(millis[0], millis[millis.length - 1]);
  return total / (days.length - 1);
};

export const describeInterval = (avgDays: number): { unit: IntervalUnit; count: number } => {
  if (avgDays < 7) return { unit: "days", count: Math.max(1, Math.round(avgDays)) };
  if (avgDays < 30) return { unit: "weeks", count: Math.max(1, Math.round(avgDays / 7)) };
  if (avgDays < 90) return { unit: "months", count: Math.max(1, Math.round(avgDays / 30)) };
  return { unit: "years", count: Math.max(1, Math.round(avgDays / 365)) };
};

/** "3 days ago" in the given locale; "today" and "yesterday" are spelled out. */
export const relativeDaysText = (daysAgo: number, locale: string): string => {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (daysAgo < 14) return formatter.format(-daysAgo, "day");
  if (daysAgo < 60) return formatter.format(-Math.round(daysAgo / 7), "week");
  if (daysAgo < 365) return formatter.format(-Math.round(daysAgo / 30), "month");
  return formatter.format(-Math.round(daysAgo / 365), "year");
};

export const DEFAULT_WATERING_INTERVAL_DAYS = 7;

export type WateringTone = "due" | "overdue" | "ok";

export interface WateringStatus {
  /** Whole days since the latest watering; null when the plant was never watered. */
  daysSince: number | null;
  intervalDays: number;
  tone: WateringTone;
  /** Ascending sort key: more negative means thirstier; 0 for plants that are fine. */
  rank: number;
}

/**
 * Where a plant stands against its own rhythm. With fewer than two watering days the rhythm
 * is unknown, so the default interval applies and the plant is only flagged once the last
 * watering is older than it. "overdue" means late by more than one full interval.
 */
export const wateringStatus = (
  records: { date_millis: number }[],
  nowMillis: number = Date.now(),
): WateringStatus => {
  const latest = latestWateringMillis(records);
  const average = averageIntervalDays(records);
  const intervalDays = average ?? DEFAULT_WATERING_INTERVAL_DAYS;
  if (latest === null) return { daysSince: null, intervalDays, tone: "ok", rank: 0 };

  const daysSince = Math.max(0, calendarDaysBetween(latest, nowMillis));
  const isDue = average === null ? daysSince > intervalDays : daysSince >= intervalDays;
  if (!isDue) return { daysSince, intervalDays, tone: "ok", rank: 0 };

  const lateBy = daysSince - intervalDays;
  return {
    daysSince,
    intervalDays,
    tone: lateBy > intervalDays ? "overdue" : "due",
    rank: -(lateBy + 1),
  };
};
