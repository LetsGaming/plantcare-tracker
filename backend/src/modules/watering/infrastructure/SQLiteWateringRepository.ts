import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import { applyKeyset } from '../../../core/pagination';
import type { WateringSummary } from '../../plants/domain/wateringSummary';
import type {
  WateringRepository,
  WateringRecordRow,
  WateringHistoryQuery,
  WateringHistoryRows,
  FertilizerType,
  CreateWateringDTO,
  UpdateWateringDTO,
  NewWateringEntry,
  WateringBatchRows,
} from '../domain/WateringRecord';
import { loadSummaries } from './wateringSummary';

interface StoredRow {
  id: number;
  plant_id: number;
  date: number;
  used_fertilizer: number;
  fertilizer_type_id: number | null;
}

const RECORD_COLUMNS = ['id', 'plant_id', 'date', 'used_fertilizer', 'fertilizer_type_id'] as const;

const ownedPlantIds = (userId: number) =>
  getKysely().selectFrom('plants').select('id').where('user_id', '=', userId);

/**
 * Keyset page of one plant's history, newest first, read straight from
 * idx_watering_history(plant_id, date DESC, id DESC) without a sort.
 */
export const historyPageQuery = (plantId: number, query: WateringHistoryQuery) =>
  applyKeyset(
    getKysely()
      .selectFrom('watering_records as wr')
      .select(['wr.id', 'wr.plant_id', 'wr.date', 'wr.used_fertilizer', 'wr.fertilizer_type_id'])
      .where('wr.plant_id', '=', plantId),
    {
      column: 'wr.date',
      idColumn: 'wr.id',
      direction: 'desc',
      cursor: query.cursor,
      limit: query.limit,
    },
  );

class OwnershipRollback extends Error {}

export class SQLiteWateringRepository implements WateringRepository {
  async findHistory(
    plantId: number,
    userId: number,
    query: WateringHistoryQuery,
  ): Promise<WateringHistoryRows | null> {
    const owned = await ownedPlantIds(userId).where('id', '=', plantId).executeTakeFirst();
    if (!owned) return null;

    const rows = (await historyPageQuery(plantId, query).execute()).map(mapRow);
    if (!query.withTotal) return { rows };
    const { total } = await getKysely()
      .selectFrom('watering_records')
      .select((eb) => eb.fn.countAll<number>().as('total'))
      .where('plant_id', '=', plantId)
      .executeTakeFirstOrThrow();
    return { rows, total: Number(total) };
  }

  async findById(recordId: number, userId: number): Promise<WateringRecordRow | null> {
    const row = await getKysely()
      .selectFrom('watering_records')
      .select([...RECORD_COLUMNS])
      .where('id', '=', recordId)
      .where('plant_id', 'in', ownedPlantIds(userId))
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async findFertilizerTypes(): Promise<FertilizerType[]> {
    const rows = await getKysely().selectFrom('fertilizer_types').select(['id', 'name']).execute();
    return rows.map((r) => ({ fertilizer_id: r.id, fertilizer_name: r.name }));
  }

  async create(dto: CreateWateringDTO, userId: number): Promise<WateringRecordRow | null> {
    const result = await sql<StoredRow>`
      INSERT INTO watering_records (plant_id, date, used_fertilizer, fertilizer_type_id)
      SELECT ${dto.plantId}, ${dto.date}, ${dto.usedFertilizer ? 1 : 0}, ${dto.fertilizerTypeId ?? null}
      WHERE EXISTS (SELECT 1 FROM plants WHERE id = ${dto.plantId} AND user_id = ${userId})
      RETURNING id, plant_id, date, used_fertilizer, fertilizer_type_id
    `.execute(getKysely());
    const row = result.rows[0];
    return row ? mapRow(row) : null;
  }

  async update(
    recordId: number,
    userId: number,
    dto: UpdateWateringDTO,
  ): Promise<WateringRecordRow | null> {
    const changes: {
      date?: number;
      used_fertilizer?: number;
      fertilizer_type_id?: number | null;
    } = {};
    if (dto.date !== undefined && dto.date !== null) changes.date = dto.date;
    if (dto.usedFertilizer !== undefined) changes.used_fertilizer = dto.usedFertilizer ? 1 : 0;
    if (dto.fertilizerTypeId !== undefined) changes.fertilizer_type_id = dto.fertilizerTypeId;
    if (!Object.keys(changes).length) return null;

    const row = await getKysely()
      .updateTable('watering_records')
      .set(changes)
      .where('id', '=', recordId)
      .where('plant_id', 'in', ownedPlantIds(userId))
      .returning([...RECORD_COLUMNS])
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async delete(recordId: number, userId: number): Promise<number | null> {
    const row = await getKysely()
      .deleteFrom('watering_records')
      .where('id', '=', recordId)
      .where('plant_id', 'in', ownedPlantIds(userId))
      .returning('plant_id')
      .executeTakeFirst();
    return row ? row.plant_id : null;
  }

  async createMany(
    userId: number,
    entries: NewWateringEntry[],
    date: number,
    tzMinutes: number,
  ): Promise<WateringBatchRows | null> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const plantIds = [...new Set(entries.map((e) => e.plantId))];
        const { owned } = await trx
          .selectFrom('plants')
          .select((eb) => eb.fn.countAll<number>().as('owned'))
          .where('user_id', '=', userId)
          .where('id', 'in', plantIds)
          .executeTakeFirstOrThrow();
        if (Number(owned) !== plantIds.length) return null;
        const rows = await trx
          .insertInto('watering_records')
          .values(
            entries.map((entry) => ({
              plant_id: entry.plantId,
              date,
              used_fertilizer: entry.usedFertilizer ? 1 : 0,
              fertilizer_type_id: entry.usedFertilizer ? (entry.fertilizerTypeId ?? null) : null,
            })),
          )
          .returning([...RECORD_COLUMNS])
          .execute();
        const position = new Map(entries.map((entry, index) => [entry.plantId, index]));
        const records = rows
          .map(mapRow)
          .sort((x, y) => (position.get(x.plant_id) ?? 0) - (position.get(y.plant_id) ?? 0));
        return { records, summaries: await loadSummaries(plantIds, tzMinutes, trx) };
      });
  }

  async deleteMany(
    userId: number,
    ids: number[],
    tzMinutes: number,
  ): Promise<Map<number, WateringSummary> | null> {
    const wanted = new Set(ids).size;
    try {
      return await getKysely()
        .transaction()
        .execute(async (trx) => {
          const deleted = await trx
            .deleteFrom('watering_records')
            .where('id', 'in', ids)
            .where(
              'plant_id',
              'in',
              trx.selectFrom('plants').select('id').where('user_id', '=', userId),
            )
            .returning('plant_id')
            .execute();
          if (deleted.length !== wanted) throw new OwnershipRollback();
          const plantIds = [...new Set(deleted.map((r) => r.plant_id))];
          return await loadSummaries(plantIds, tzMinutes, trx);
        });
    } catch (err) {
      if (err instanceof OwnershipRollback) return null;
      throw err;
    }
  }

  summariesFor(
    plantIds: readonly number[],
    tzMinutes: number,
  ): Promise<Map<number, WateringSummary>> {
    return loadSummaries(plantIds, tzMinutes);
  }
}

function mapRow(row: StoredRow): WateringRecordRow {
  return {
    id: row.id,
    plant_id: row.plant_id,
    date: row.date,
    used_fertilizer: Boolean(row.used_fertilizer),
    fertilizer_type_id: row.fertilizer_type_id,
  };
}
