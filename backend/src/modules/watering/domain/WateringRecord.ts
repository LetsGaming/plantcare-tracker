/**
 * modules/watering/domain/WateringRecord.ts
 */

import type { Cursor } from '../../../core/pagination';
import type { WateringSummary } from '../../plants/domain/wateringSummary';

/** A stored record; `date` is the raw epoch-seconds column, which is also the cursor key. */
export interface WateringRecordRow {
  id: number;
  plant_id: number;
  date: number;
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
}

/** Wire shape of one record; `date` is epoch milliseconds. */
export interface WateringItem {
  id: number;
  plant_id: number;
  date: number;
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
}

export const toWateringItem = (row: WateringRecordRow): WateringItem => ({
  id: row.id,
  plant_id: row.plant_id,
  date: row.date * 1000,
  used_fertilizer: row.used_fertilizer,
  fertilizer_type_id: row.fertilizer_type_id,
});

export interface FertilizerType {
  fertilizer_id: number;
  fertilizer_name: string;
}

export interface CreateWateringDTO {
  plantId: number;
  date: number; // Unix epoch seconds
  usedFertilizer: boolean;
  fertilizerTypeId: number | null;
}

export interface UpdateWateringDTO {
  date?: number | null; // Unix epoch seconds
  usedFertilizer?: boolean;
  fertilizerTypeId?: number | null;
}

export interface NewWateringEntry {
  plantId: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number | null;
}

export type WateringSummaries = Record<number, WateringSummary>;

export interface WateringBatchRows {
  records: WateringRecordRow[];
  summaries: Map<number, WateringSummary>;
}

export interface WateringHistoryQuery {
  limit: number;
  cursor: Cursor | null;
  withTotal: boolean;
}

export interface WateringHistoryRows {
  /** Up to limit + 1 rows, newest first. */
  rows: WateringRecordRow[];
  total?: number;
}

export interface WateringRepository {
  /** Null when the plant does not exist or is not the user's. */
  findHistory(
    plantId: number,
    userId: number,
    query: WateringHistoryQuery,
  ): Promise<WateringHistoryRows | null>;
  findById(recordId: number, userId: number): Promise<WateringRecordRow | null>;
  findFertilizerTypes(): Promise<FertilizerType[]>;
  /** Null when the plant is not the user's. */
  create(dto: CreateWateringDTO, userId: number): Promise<WateringRecordRow | null>;
  /** Null when the record is not the user's or there is nothing to change. */
  update(
    recordId: number,
    userId: number,
    dto: UpdateWateringDTO,
  ): Promise<WateringRecordRow | null>;
  /** Plant id of the deleted record, or null when it is not the user's. */
  delete(recordId: number, userId: number): Promise<number | null>;
  /**
   * All-or-nothing; null (nothing inserted) unless every plant is the user's.
   * Records come back in entry order, summaries are read inside the same transaction.
   */
  createMany(
    userId: number,
    entries: NewWateringEntry[],
    date: number,
    tzMinutes: number,
  ): Promise<WateringBatchRows | null>;
  /**
   * All-or-nothing; summaries of the distinct plants of the deleted records (read inside the
   * same transaction), or null (nothing deleted).
   */
  deleteMany(
    userId: number,
    ids: number[],
    tzMinutes: number,
  ): Promise<Map<number, WateringSummary> | null>;
  /** Summaries of plants the caller has already authorized. */
  summariesFor(
    plantIds: readonly number[],
    tzMinutes: number,
  ): Promise<Map<number, WateringSummary>>;
}
