import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import { toPublicImageUrl } from '../../../core/config';
import type { SubstrateRepository, SubstrateData, ImageRef } from '../domain/Substrate';

interface SubstrateRow {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: number;
  substrate_created_at: number;
  component_id: number | null;
  component_name: string | null;
  component_fineness_name: string | null;
  component_parts: number | null;
  image_id: number | null;
  image_url: string | null;
  upload_date: number | null;
}

const substrateRows = () =>
  getKysely()
    .selectFrom('substrates as s')
    .leftJoin('substrate_components as sc', 's.id', 'sc.substrate_id')
    .leftJoin('components as c', 'sc.component_id', 'c.id')
    .leftJoin('fineness_levels as fl', 'c.fineness_id', 'fl.id')
    .leftJoin('images as img', (join) =>
      join.onRef('img.entity_id', '=', 's.id').on('img.entity_type', '=', 'substrate'),
    )
    .select([
      's.id as substrate_id',
      's.user_id as substrate_user_id',
      's.name as substrate_name',
      's.is_public',
      's.created_at as substrate_created_at',
      'sc.component_id',
      'c.name as component_name',
      'fl.name as component_fineness_name',
      'sc.parts as component_parts',
      'img.id as image_id',
      'img.image_url',
      'img.upload_date',
    ])
    .orderBy('img.upload_date')
    .orderBy('img.id');

const roundParts = (parts: number): number => Math.round(parts * 100) / 100;

export class SQLiteSubstrateRepository implements SubstrateRepository {
  async findAllPublic(): Promise<SubstrateData[]> {
    return this.groupRows(await substrateRows().where('s.is_public', '=', 1).execute());
  }

  async findAllByUser(userId: number): Promise<SubstrateData[]> {
    return this.groupRows(await substrateRows().where('s.user_id', '=', userId).execute());
  }

  async findById(id: number): Promise<SubstrateData | null> {
    const rows = await substrateRows().where('s.id', '=', id).execute();
    return this.groupRows(rows)[0] ?? null;
  }

  async create(name: string, userId: number, isPublic: boolean): Promise<number> {
    const result = await getKysely()
      .insertInto('substrates')
      .values({
        name,
        user_id: userId,
        is_public: isPublic ? 1 : 0,
        created_at: sql<number>`strftime('%s','now')`,
      })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async update(
    id: number,
    userId: number,
    fields: { name?: string; isPublic?: boolean },
  ): Promise<boolean> {
    const changes: { name?: string; is_public?: number } = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.isPublic !== undefined) changes.is_public = fields.isPublic ? 1 : 0;
    if (!Object.keys(changes).length) return false;

    const result = await getKysely()
      .updateTable('substrates')
      .set(changes)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('substrates')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async addComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void> {
    await getKysely()
      .transaction()
      .execute(async (trx) => {
        for (const { componentId, parts } of components) {
          await trx
            .insertInto('substrate_components')
            .values({
              substrate_id: substrateId,
              component_id: componentId,
              parts: roundParts(parts),
            })
            .execute();
        }
      });
  }

  async upsertComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void> {
    await getKysely()
      .transaction()
      .execute(async (trx) => {
        for (const { componentId, parts } of components) {
          await trx
            .insertInto('substrate_components')
            .orReplace()
            .values({
              substrate_id: substrateId,
              component_id: componentId,
              parts: roundParts(parts),
            })
            .execute();
        }
      });
  }

  async deleteComponents(substrateId: number, componentIds: number[]): Promise<void> {
    if (!componentIds.length) return;
    await getKysely()
      .deleteFrom('substrate_components')
      .where('substrate_id', '=', substrateId)
      .where('component_id', 'in', componentIds)
      .execute();
  }

  private groupRows(rows: SubstrateRow[]): SubstrateData[] {
    const map = new Map<number, SubstrateData>();

    for (const row of rows) {
      if (!map.has(row.substrate_id)) {
        map.set(row.substrate_id, {
          substrate_id: row.substrate_id,
          substrate_user_id: row.substrate_user_id,
          substrate_name: row.substrate_name,
          is_public: Boolean(row.is_public),
          substrate_created_at: row.substrate_created_at,
          image_url: null,
          images: [],
          components: [],
        });
      }

      const s = map.get(row.substrate_id)!;

      if (row.component_id && !s.components.find((c) => c.component_id === row.component_id)) {
        s.components.push({
          component_id: row.component_id,
          component_name: row.component_name ?? '',
          component_fineness: row.component_fineness_name ?? '',
          component_parts: row.component_parts ?? 0,
        });
      }

      if (row.image_id && !s.images.find((i) => i.id === row.image_id)) {
        const imageRef: ImageRef = {
          id: row.image_id,
          url: row.image_url ? toPublicImageUrl(row.image_url) : '',
          date: row.upload_date ?? 0,
        };
        s.images.push(imageRef);
        s.image_url = imageRef.url;
      }
    }

    return Array.from(map.values());
  }
}
