/**
 * modules/watering/infrastructure/SQLiteWateringRepository.ts
 *
 * SQLite-specific note:
 *  • The MySQL INSERT … SELECT pattern (ownership check in the same statement)
 *    is preserved unchanged — SQLite supports it.
 *  • used_fertilizer is stored as INTEGER 0/1 and coerced to boolean in mapRow().
 */

import { query, execute } from '../../../core/database/db';
import type {
  WateringRepository,
  WateringRecordData,
  FertilizerType,
  CreateWateringDTO,
  UpdateWateringDTO,
} from '../domain/WateringRecord';

type SqlParam = string | number | boolean | null;

interface WateringRow {
  record_id: number;
  watering_date: string;
  used_fertilizer: number;
  fertilizer_type_id: number | null;
  fertilizer_type: string | null;
  plant_id: number;
  plant_name: string;
  owner_id: number;
}

const BASE_QUERY = `
  SELECT wr.id AS record_id, wr.date AS watering_date, wr.used_fertilizer,
    ft.id AS fertilizer_type_id, ft.name AS fertilizer_type,
    p.id AS plant_id, p.name AS plant_name, p.user_id AS owner_id
  FROM watering_records wr
  LEFT JOIN plants p           ON wr.plant_id = p.id
  LEFT JOIN fertilizer_types ft ON wr.fertilizer_type_id = ft.id
`;

export class SQLiteWateringRepository implements WateringRepository {
  async findByPlant(plantId: number, userId: number): Promise<WateringRecordData[]> {
    const rows = query<WateringRow>(
      `${BASE_QUERY} WHERE wr.plant_id = ? AND p.user_id = ?`,
      [plantId, userId],
    );
    return rows.map(mapRow);
  }

  async findById(recordId: number, userId: number): Promise<WateringRecordData | null> {
    const rows = query<WateringRow>(
      `${BASE_QUERY} WHERE wr.id = ? AND p.user_id = ?`,
      [recordId, userId],
    );
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async findFertilizerTypes(): Promise<FertilizerType[]> {
    const rows = query<{ id: number; name: string }>('SELECT id, name FROM fertilizer_types');
    return rows.map((r) => ({ fertilizer_id: r.id, fertilizer_name: r.name }));
  }

  async create(dto: CreateWateringDTO, userId: number): Promise<number> {
    // INSERT … SELECT ensures the plant belongs to the authenticated user
    // in a single atomic statement — no separate ownership query needed.
    const result = execute(
      `INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id)
       SELECT ?, ?, ?, ? WHERE EXISTS (
         SELECT 1 FROM plants WHERE id = ? AND user_id = ?
       )`,
      [dto.plantId, dto.date, dto.usedFertilizer ? 1 : 0, dto.fertilizerTypeId ?? null, dto.plantId, userId],
    );
    return result.affectedRows === 0 ? 0 : result.insertId;
  }

  async update(recordId: number, userId: number, dto: UpdateWateringDTO): Promise<boolean> {
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (dto.date !== undefined)            { updates.push('date = ?');              params.push(dto.date); }
    if (dto.usedFertilizer !== undefined)  { updates.push('used_fertilizer = ?');   params.push(dto.usedFertilizer ? 1 : 0); }
    if (dto.fertilizerTypeId !== undefined){ updates.push('fertilizer_type_id = ?'); params.push(dto.fertilizerTypeId); }

    if (!updates.length) return false;
    params.push(recordId, userId);

    const result = execute(
      `UPDATE watering_records SET ${updates.join(', ')}
       WHERE id = ? AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)`,
      params,
    );
    return result.affectedRows > 0;
  }

  async delete(recordId: number, userId: number): Promise<boolean> {
    const result = execute(
      `DELETE FROM watering_records WHERE id = ?
       AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)`,
      [recordId, userId],
    );
    return result.affectedRows > 0;
  }
}

function mapRow(row: WateringRow): WateringRecordData {
  return { ...row, used_fertilizer: Boolean(row.used_fertilizer) };
}
