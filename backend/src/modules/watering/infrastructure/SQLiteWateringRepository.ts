import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type {
  WateringRepository,
  WateringRecordData,
  FertilizerType,
  CreateWateringDTO,
  UpdateWateringDTO,
  NewWateringEntry,
} from '../domain/WateringRecord';

interface WateringRow {
  record_id: number;
  plant_id: number;
  plant_name: string;
  watering_date: number; // Unix epoch seconds stored by SQLite
  used_fertilizer: number;
  fertilizer_type_id: number | null;
  fertilizer_type: string | null;
  owner_id: number;
}

const wateringRows = () =>
  getKysely()
    .selectFrom('watering_records as wr')
    .innerJoin('plants as p', 'wr.plant_id', 'p.id')
    .leftJoin('fertilizer_types as ft', 'wr.fertilizer_type_id', 'ft.id')
    .select([
      'wr.id as record_id',
      'wr.plant_id',
      'wr.date as watering_date',
      'wr.used_fertilizer',
      'ft.id as fertilizer_type_id',
      'ft.name as fertilizer_type',
      'p.name as plant_name',
      'p.user_id as owner_id',
    ]);

const ownedPlantIds = (userId: number) =>
  getKysely().selectFrom('plants').select('id').where('user_id', '=', userId);

export class SQLiteWateringRepository implements WateringRepository {
  async findByPlant(plantId: number, userId: number): Promise<WateringRecordData[]> {
    const rows = await wateringRows()
      .where('wr.plant_id', '=', plantId)
      .where('p.user_id', '=', userId)
      .execute();
    return rows.map(mapRow);
  }

  async findById(recordId: number, userId: number): Promise<WateringRecordData | null> {
    const row = await wateringRows()
      .where('wr.id', '=', recordId)
      .where('p.user_id', '=', userId)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async findFertilizerTypes(): Promise<FertilizerType[]> {
    const rows = await getKysely().selectFrom('fertilizer_types').select(['id', 'name']).execute();
    return rows.map((r) => ({ fertilizer_id: r.id, fertilizer_name: r.name }));
  }

  /** Inserts only when the plant belongs to the user; returns 0 otherwise. */
  async create(dto: CreateWateringDTO, userId: number): Promise<number> {
    const result = await sql`
      INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id)
      SELECT ${dto.plantId}, ${dto.date}, ${dto.usedFertilizer ? 1 : 0}, ${dto.fertilizerTypeId ?? null}
      WHERE EXISTS (SELECT 1 FROM plants WHERE id = ${dto.plantId} AND user_id = ${userId})
    `.execute(getKysely());
    return Number(result.numAffectedRows ?? 0) === 0 ? 0 : Number(result.insertId);
  }

  async update(recordId: number, userId: number, dto: UpdateWateringDTO): Promise<boolean> {
    const changes: {
      date?: number;
      used_fertilizer?: number;
      fertilizer_type_id?: number | null;
    } = {};
    if (dto.date !== undefined && dto.date !== null) changes.date = dto.date;
    if (dto.usedFertilizer !== undefined) changes.used_fertilizer = dto.usedFertilizer ? 1 : 0;
    if (dto.fertilizerTypeId !== undefined) changes.fertilizer_type_id = dto.fertilizerTypeId;
    if (!Object.keys(changes).length) return false;

    const result = await getKysely()
      .updateTable('watering_records')
      .set(changes)
      .where('id', '=', recordId)
      .where('plant_id', 'in', ownedPlantIds(userId))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async delete(recordId: number, userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('watering_records')
      .where('id', '=', recordId)
      .where('plant_id', 'in', ownedPlantIds(userId))
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  /** All-or-nothing: returns null (nothing inserted) unless every plant belongs to the user. */
  async createMany(
    userId: number,
    entries: NewWateringEntry[],
    date: number,
  ): Promise<number[] | null> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const plantIds = [...new Set(entries.map((e) => e.plantId))];
        const owned = await trx
          .selectFrom('plants')
          .select('id')
          .where('user_id', '=', userId)
          .where('id', 'in', plantIds)
          .execute();
        if (owned.length !== plantIds.length) return null;
        const ids: number[] = [];
        for (const entry of entries) {
          const result = await trx
            .insertInto('watering_records')
            .values({
              plant_id: entry.plantId,
              date,
              used_fertilizer: entry.usedFertilizer ? 1 : 0,
              fertilizer_type_id: entry.usedFertilizer ? (entry.fertilizerTypeId ?? null) : null,
            })
            .executeTakeFirstOrThrow();
          ids.push(Number(result.insertId));
        }
        return ids;
      });
  }

  /** All-or-nothing: deletes nothing unless every id is a record of the user's plants. */
  async deleteMany(userId: number, ids: number[]): Promise<boolean> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const owned = await trx
          .selectFrom('watering_records as w')
          .innerJoin('plants as p', 'p.id', 'w.plant_id')
          .select('w.id')
          .where('p.user_id', '=', userId)
          .where('w.id', 'in', ids)
          .execute();
        if (owned.length !== new Set(ids).size) return false;
        await trx.deleteFrom('watering_records').where('id', 'in', ids).execute();
        return true;
      });
  }
}

function mapRow(row: WateringRow): WateringRecordData {
  return {
    record_id: row.record_id,
    plant_id: row.plant_id,
    plant_name: row.plant_name,
    watering_date: row.watering_date,
    used_fertilizer: Boolean(row.used_fertilizer),
    fertilizer_type_id: row.fertilizer_type_id,
    fertilizer_type: row.fertilizer_type,
    owner_id: row.owner_id,
  };
}
