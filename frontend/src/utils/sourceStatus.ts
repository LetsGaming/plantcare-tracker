export type StatusTone = "danger" | "warning" | "success" | "neutral";

const TONES: Record<SourceStatus, StatusTone> = {
  failing: "danger",
  degraded: "warning",
  ok: "success",
  unknown: "neutral",
};

const RANKS: Record<SourceStatus, number> = {
  failing: 0,
  degraded: 1,
  unknown: 2,
  ok: 3,
};

/** The one color role of a source status; badges, chips, rows and the menu share it. */
export const statusTone = (status: SourceStatus): StatusTone => TONES[status];

/** Ionic color name for a status badge. */
export const statusIonColor = (status: SourceStatus): string =>
  TONES[status] === "neutral" ? "medium" : TONES[status];

/** Sorts failing first, then degraded, unknown and ok. */
export const statusRank = (status: SourceStatus): number => RANKS[status];

export const countByStatus = (
  sources: { status: SourceStatus }[],
): Record<SourceStatus, number> => {
  const counts: Record<SourceStatus, number> = { ok: 0, degraded: 0, failing: 0, unknown: 0 };
  sources.forEach((source) => (counts[source.status] += 1));
  return counts;
};

/** Short localization key suffix for the likely cause of a failing source's error text. */
export const failureCause = (error: string | undefined): "blocked" | "timeout" | "layout" => {
  const text = (error ?? "").toLowerCase();
  if (/(\b403\b|\b429\b|blocked|forbidden|captcha|rate.?limit)/.test(text)) return "blocked";
  if (/(timeout|timed out|econn|enotfound|network|fetch failed|socket)/.test(text))
    return "timeout";
  return "layout";
};
