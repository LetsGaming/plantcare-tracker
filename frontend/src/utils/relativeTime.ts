import { DateTime } from "luxon";

const JUST_NOW_SECONDS = 10;

/** Relative phrase such as "3 minutes ago"; null when the moment is "just now" (under ten seconds). */
export const relativePhrase = (
  iso: string,
  locale: string,
  now: number = Date.now(),
): string | null => {
  const moment = DateTime.fromISO(iso);
  if (!moment.isValid) return "";
  if (Math.abs(now - moment.toMillis()) < JUST_NOW_SECONDS * 1000) return null;
  return moment.setLocale(locale).toRelative({ base: DateTime.fromMillis(now) }) ?? "";
};
