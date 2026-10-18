import { ValidationError } from '../../../core/errors';

/** Epoch milliseconds, or null when there is nothing to report. */
export interface WateringSummary {
  last_watered_at: number | null;
  last_fertilized_at: number | null;
  /** Mean gap in local calendar days between distinct watering days; null with fewer than two. */
  avg_interval_days: number | null;
}

/** Aggregates over one plant's watering records; dates are epoch seconds as stored. */
export interface WateringAggregates {
  lastWateredSec: number | null;
  lastFertilizedSec: number | null;
  firstWateredSec: number | null;
  distinctLocalDays: number;
}

export const TZ_OFFSET_MIN = -840;
export const TZ_OFFSET_MAX = 840;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_MINUTE = 60;

/** Minutes east of UTC (the negated Date#getTimezoneOffset); absent means UTC. */
export const parseTzOffset = (raw: unknown): number => {
  if (raw === undefined || raw === '') return 0;
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw new ValidationError('tz_offset must be an integer.', { tz_offset: 'invalid' });
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < TZ_OFFSET_MIN || value > TZ_OFFSET_MAX) {
    throw new ValidationError(
      `tz_offset must be an integer between ${TZ_OFFSET_MIN} and ${TZ_OFFSET_MAX} minutes.`,
      { tz_offset: 'invalid' },
    );
  }
  return value;
};

const localDayNumber = (epochSec: number, tzMinutes: number): number =>
  Math.floor((epochSec + tzMinutes * SECONDS_PER_MINUTE) / SECONDS_PER_DAY);

const toMillis = (sec: number | null): number | null => (sec === null ? null : sec * 1000);

/**
 * Mirrors frontend averageIntervalDays: whole local calendar days between the
 * first and last watering day divided by (distinct days - 1), unrounded.
 */
export const toWateringSummary = (agg: WateringAggregates, tzMinutes: number): WateringSummary => {
  let avg: number | null = null;
  if (agg.distinctLocalDays >= 2 && agg.firstWateredSec !== null && agg.lastWateredSec !== null) {
    const span =
      localDayNumber(agg.lastWateredSec, tzMinutes) -
      localDayNumber(agg.firstWateredSec, tzMinutes);
    avg = span / (agg.distinctLocalDays - 1);
  }
  return {
    last_watered_at: toMillis(agg.lastWateredSec),
    last_fertilized_at: toMillis(agg.lastFertilizedSec),
    avg_interval_days: avg,
  };
};
