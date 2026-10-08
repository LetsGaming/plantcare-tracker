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

export type DateInput = number | Date | string;

const toLocalDate = (input: DateInput): Date | null => {
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : input;
  if (typeof input === "number") return Number.isFinite(input) ? new Date(input) : null;
  const parts = parseDayKey(input);
  if (parts) return new Date(parts.year, parts.month - 1, parts.day);
  const parsed = new Date(input);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** The one short date every screen shows (day and month always two digits), e.g. 04.09.2026. */
export const formatDisplayDate = (input: DateInput, locale: string): string => {
  const date = toLocalDate(input);
  if (!date) return String(input);
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
};

/** The spelled-out form of the same date for titles that must be unambiguous. */
export const formatLongDate = (input: DateInput, locale: string): string => {
  const date = toLocalDate(input);
  if (!date) return String(input);
  const text = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
  // Keep the day and the month name together when a title wraps.
  return text.replace(/^(\d{1,2}\.?) /, "$1 ");
};
