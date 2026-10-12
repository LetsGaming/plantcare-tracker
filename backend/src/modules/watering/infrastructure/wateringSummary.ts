import { sql, type RawBuilder } from 'kysely';
import { getKysely } from '../../../core/database/db';
import {
  toWateringSummary,
  type WateringAggregates,
  type WateringSummary,
} from '../../plants/domain/wateringSummary';

/** SQLite date modifier for a local day boundary, e.g. '+120 minutes'. */
export const tzModifier = (tzMinutes: number): string =>
  `${tzMinutes < 0 ? '-' : '+'}${Math.abs(tzMinutes)} minutes`;

export interface SummaryColumns {
  last_watered_sec: RawBuilder<number | null>;
  last_fertilized_sec: RawBuilder<number | null>;
  first_watered_sec: RawBuilder<number | null>;
  distinct_local_days: RawBuilder<number>;
}

/**
 * Correlated scalar subqueries over `plantIdRef` (e.g. 'p.id'). Each is served
 * by idx_watering_history(plant_id, date DESC): MAX and MIN read one index
 * entry, the fertilizer MAX stops at the first fertilized entry, the day count
 * walks only that plant's entries.
 */
export const summaryColumns = (plantIdRef: string, tzMinutes: number): SummaryColumns => {
  const plantId = sql.ref(plantIdRef);
  const tz = tzModifier(tzMinutes);
  return {
    last_watered_sec: sql<
      number | null
    >`(SELECT MAX(wh.date) FROM watering_records wh WHERE wh.plant_id = ${plantId})`,
    last_fertilized_sec: sql<
      number | null
    >`(SELECT MAX(wh.date) FROM watering_records wh WHERE wh.plant_id = ${plantId} AND wh.used_fertilizer = 1)`,
    first_watered_sec: sql<
      number | null
    >`(SELECT MIN(wh.date) FROM watering_records wh WHERE wh.plant_id = ${plantId})`,
    distinct_local_days: sql<number>`(SELECT COUNT(DISTINCT date(wh.date, 'unixepoch', ${tz})) FROM watering_records wh WHERE wh.plant_id = ${plantId})`,
  };
};

export interface SummaryRow {
  last_watered_sec: number | null;
  last_fertilized_sec: number | null;
  first_watered_sec: number | null;
  distinct_local_days: number;
}

export const summaryFromRow = (row: SummaryRow, tzMinutes: number): WateringSummary => {
  const aggregates: WateringAggregates = {
    lastWateredSec: row.last_watered_sec,
    lastFertilizedSec: row.last_fertilized_sec,
    firstWateredSec: row.first_watered_sec,
    distinctLocalDays: row.distinct_local_days,
  };
  return toWateringSummary(aggregates, tzMinutes);
};

/** Summaries for the given plants in one query; ids that do not exist are absent from the map. */
export const loadSummaries = async (
  plantIds: readonly number[],
  tzMinutes: number,
): Promise<Map<number, WateringSummary>> => {
  const result = new Map<number, WateringSummary>();
  if (plantIds.length === 0) return result;
  const cols = summaryColumns('p.id', tzMinutes);
  const rows = await getKysely()
    .selectFrom('plants as p')
    .select([
      'p.id as plant_id',
      cols.last_watered_sec.as('last_watered_sec'),
      cols.last_fertilized_sec.as('last_fertilized_sec'),
      cols.first_watered_sec.as('first_watered_sec'),
      cols.distinct_local_days.as('distinct_local_days'),
    ])
    .where('p.id', 'in', [...plantIds])
    .execute();
  for (const row of rows) result.set(row.plant_id, summaryFromRow(row, tzMinutes));
  return result;
};
