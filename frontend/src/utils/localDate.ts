/**
 * Day-level date helpers in the user's local calendar. A day is identified by
 * its "YYYY-MM-DD" key built from local date parts, never from toISOString(),
 * so a day cannot shift when the local offset differs from UTC.
 */

const pad = (value: number): string => String(value).padStart(2, "0");

export const toDayKey = (input: number | Date): string => {
  const date = typeof input === "number" ? new Date(input) : input;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const parseDayKey = (key: string): { year: number; month: number; day: number } | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
};

/**
 * Epoch millis to store for a picked day: the current instant for today, local
 * noon otherwise, so the day survives offsets of up to twelve hours.
 */
export const dayKeyToMillis = (key: string, now: number = Date.now()): number => {
  const parts = parseDayKey(key);
  if (!parts) return now;
  if (toDayKey(now) === key) return now;
  return new Date(parts.year, parts.month - 1, parts.day, 12).getTime();
};

/** Whole local calendar days from `fromMillis` to `toMillis` (negative when in the past). */
export const calendarDaysBetween = (fromMillis: number, toMillis: number): number => {
  const from = parseDayKey(toDayKey(fromMillis))!;
  const to = parseDayKey(toDayKey(toMillis))!;
  const utcFrom = Date.UTC(from.year, from.month - 1, from.day);
  const utcTo = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((utcTo - utcFrom) / 86400000);
};
