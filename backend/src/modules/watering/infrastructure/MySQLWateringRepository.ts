/**
 * modules/watering/infrastructure/MySQLWateringRepository.ts
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { WateringRepository, WateringRecordData, FertilizerType, CreateWateringDTO, UpdateWateringDTO } from '../domain/WateringRecord';

interface WateringRow extends RowDataPacket {
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
  SELECT wr.id as record_id, wr.date as watering_date, wr.used_fertilizer,
    ft.id as fertilizer_type_id, ft.name as fertilizer_type,
    p.id as plant_id, p.name as plant_name, p.user_id as owner_id
  FROM watering_records wr
  LEFT JOIN plants p ON wr.plant_id = p.id
  LEFT JOIN fertilizer_types ft ON wr.fertilizer_type_id = ft.id
`;

export class MySQLWateringRepository implements WateringRepository {
  constructor(private readonly pool: Pool) {}

  async findByPlant(plantId: number, userId: number): Promise<WateringRecordData[]> {
    const [rows] = await this.pool.query<WateringRow[]>(
      `${BASE_QUERY} WHERE wr.plant_id = ? AND p.user_id = ?`,
      [plantId, userId],
    );
    return rows.map(this.mapRow);
  }

  async findById(recordId: number, userId: number): Promise<WateringRecordData | null> {
    const [rows] = await this.pool.query<WateringRow[]>(
      `${BASE_QUERY} WHERE wr.id = ? AND p.user_id = ?`,
      [recordId, userId],
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findFertilizerTypes(): Promise<FertilizerType[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id, name FROM fertilizer_types');
    return rows.map((r) => ({ fertilizer_id: r['id'] as number, fertilizer_name: r['name'] as string }));
  }

  async create(dto: CreateWateringDTO, userId: number): Promise<number> {
    const [result] = await this.pool.execute(
      `INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id)
       SELECT ?, ?, ?, ? FROM plants WHERE id = ? AND user_id = ?`,
      [dto.plantId, dto.date, dto.usedFertilizer, dto.fertilizerTypeId, dto.plantId, userId],
    );
    const { insertId, affectedRows } = result as { insertId: number; affectedRows: number };
    if (affectedRows === 0) {
      return 0;
    }
    return insertId;
  }

  async update(recordId: number, userId: number, dto: UpdateWateringDTO): Promise<boolean> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.date !== undefined) { updates.push('date = ?'); params.push(dto.date); }
    if (dto.usedFertilizer !== undefined) { updates.push('used_fertilizer = ?'); params.push(dto.usedFertilizer); }
    if (dto.fertilizerTypeId !== undefined) {
      updates.push('fertilizer_type_id = ?');
      params.push(dto.fertilizerTypeId); // null is valid (removes fertilizer)
    }

    if (!updates.length) return false;
    params.push(recordId, userId);

    const [result] = await this.pool.execute(
      `UPDATE watering_records SET ${updates.join(', ')}
       WHERE id = ? AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)`,
      params as (string | number | boolean | null)[],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async delete(recordId: number, userId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      `DELETE FROM watering_records WHERE id = ?
       AND plant_id IN (SELECT id FROM plants WHERE user_id = ?)`,
      [recordId, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  private mapRow(row: WateringRow): WateringRecordData {
    return { ...row, used_fertilizer: Boolean(row.used_fertilizer) };
  }
}
