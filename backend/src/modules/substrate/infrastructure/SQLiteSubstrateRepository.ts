import { sql, type Kysely, type SqlBool } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { Database } from '../../../core/database/schema';
import { applyKeyset, containsLike, toPage } from '../../../core/pagination';
import type { ImageDTO } from '../../images/domain/imageDto';
import { IMAGE_COLUMNS, imageRowToDto } from '../../images/infrastructure/imageRows';
import type {
  ComponentInput,
  ComponentRef,
  SubstrateData,
  SubstrateListItem,
  SubstrateListParams,
  SubstratePage,
  SubstrateRepository,
  SubstrateUpdateFields,
} from '../domain/Substrate';

interface BaseRow {
  id: number;
  user_id: number;
  name: string;
  is_public: number;
  created_at: number;
}

const MS_PER_SECOND = 1000;

const roundParts = (parts: number): number => Math.round(parts * 100) / 100;

type Scope = { kind: 'mine'; userId: number } | { kind: 'public' };

const filteredSubstrates = (scope: Scope, params: SubstrateListParams) => {
  let qb = getKysely().selectFrom('substrates as s');
  qb =
    scope.kind === 'mine'
      ? qb.where('s.user_id', '=', scope.userId)
      : qb.where(sql<SqlBool>`s.is_public = 1`);
  if (params.q) qb = qb.where(containsLike('s.name', params.q));
  if (params.componentId !== null) {
    qb = qb.where(
      sql<SqlBool>`EXISTS (SELECT 1 FROM substrate_components sc WHERE sc.substrate_id = s.id AND sc.component_id = ${params.componentId})`,
    );
  }
  return qb;
};

const insertMix = async (
  trx: Kysely<Database>,
  substrateId: number,
  components: ComponentInput[],
): Promise<void> => {
  for (const { componentId, parts } of components) {
    await trx
      .insertInto('substrate_components')
      .values({ substrate_id: substrateId, component_id: componentId, parts: roundParts(parts) })
      .onConflict((oc) =>
        oc.columns(['substrate_id', 'component_id']).doUpdateSet({
          parts: (eb) => eb.ref('excluded.parts'),
        }),
      )
      .execute();
  }
};

const replaceMix = async (
  trx: Kysely<Database>,
  substrateId: number,
  components: ComponentInput[],
): Promise<void> => {
  let removal = trx.deleteFrom('substrate_components').where('substrate_id', '=', substrateId);
  if (components.length) {
    removal = removal.where(
      'component_id',
      'not in',
      components.map((c) => c.componentId),
    );
  }
  await removal.execute();
  await insertMix(trx, substrateId, components);
};

const assemble = (
  bases: BaseRow[],
  components: Map<number, ComponentRef[]>,
  images: Map<number, ImageDTO[]>,
): SubstrateData[] =>
  bases.map((base) => {
    const own = images.get(base.id) ?? [];
    return {
      substrate_id: base.id,
      substrate_user_id: base.user_id,
      substrate_name: base.name,
      is_public: base.is_public === 1,
      substrate_created_at: base.created_at * MS_PER_SECOND,
      cover: own.length ? own[own.length - 1] : null,
      images: own,
      components: components.get(base.id) ?? [],
    };
  });

export class SQLiteSubstrateRepository implements SubstrateRepository {
  listMine(userId: number, params: SubstrateListParams): Promise<SubstratePage> {
    return this.list({ kind: 'mine', userId }, params);
  }

  listPublic(params: SubstrateListParams): Promise<SubstratePage> {
    return this.list({ kind: 'public' }, params);
  }

  async findById(id: number): Promise<SubstrateData | null> {
    const db = getKysely();
    const base = await db
      .selectFrom('substrates')
      .select(['id', 'user_id', 'name', 'is_public', 'created_at'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!base) return null;

    const componentRows = await db
      .selectFrom('substrate_components as sc')
      .innerJoin('components as c', 'c.id', 'sc.component_id')
      .leftJoin('fineness_levels as fl', 'fl.id', 'c.fineness_id')
      .select([
        'sc.substrate_id',
        'sc.component_id',
        'c.name as component_name',
        'fl.name as component_fineness',
        'sc.parts as component_parts',
      ])
      .where('sc.substrate_id', '=', id)
      .orderBy('sc.component_id')
      .execute();

    const imageRows = await db
      .selectFrom('images')
      .select([...IMAGE_COLUMNS, 'entity_id'])
      .where('entity_type', '=', 'substrate')
      .where('entity_id', '=', id)
      .orderBy('upload_date')
      .orderBy('id')
      .execute();

    const components = new Map<number, ComponentRef[]>();
    for (const row of componentRows) {
      const list = components.get(row.substrate_id) ?? [];
      list.push({
        component_id: row.component_id,
        component_name: row.component_name,
        component_fineness: row.component_fineness ?? '',
        component_parts: row.component_parts,
      });
      components.set(row.substrate_id, list);
    }
    const images = new Map<number, ImageDTO[]>();
    for (const row of imageRows) {
      const list = images.get(row.entity_id) ?? [];
      list.push(imageRowToDto(row));
      images.set(row.entity_id, list);
    }

    return assemble([base], components, images)[0];
  }

  async create(
    name: string,
    userId: number,
    isPublic: boolean,
    components: ComponentInput[] = [],
  ): Promise<number> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const result = await trx
          .insertInto('substrates')
          .values({
            name,
            user_id: userId,
            is_public: isPublic ? 1 : 0,
            created_at: sql<number>`strftime('%s','now')`,
          })
          .executeTakeFirstOrThrow();
        const id = Number(result.insertId);
        await insertMix(trx, id, components);
        return id;
      });
  }

  async update(id: number, userId: number, fields: SubstrateUpdateFields): Promise<boolean> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const changes: { name?: string; is_public?: number } = {};
        if (fields.name !== undefined) changes.name = fields.name;
        if (fields.isPublic !== undefined) changes.is_public = fields.isPublic ? 1 : 0;

        if (Object.keys(changes).length) {
          const result = await trx
            .updateTable('substrates')
            .set(changes)
            .where('id', '=', id)
            .where('user_id', '=', userId)
            .executeTakeFirst();
          if (Number(result.numUpdatedRows) === 0) return false;
        } else {
          const owned = await trx
            .selectFrom('substrates')
            .select('id')
            .where('id', '=', id)
            .where('user_id', '=', userId)
            .executeTakeFirst();
          if (!owned) return false;
        }

        if (fields.components) {
          await replaceMix(trx, id, fields.components);
        }
        return true;
      });
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('substrates')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  private async list(scope: Scope, params: SubstrateListParams): Promise<SubstratePage> {
    const byName = params.sort === 'name';
    const rows = await applyKeyset(
      filteredSubstrates(scope, params)
        .select(['s.id', 's.name', 's.user_id', 's.is_public', 's.created_at'])
        .select(
          sql<number>`(SELECT COUNT(*) FROM substrate_components sc WHERE sc.substrate_id = s.id)`.as(
            'component_count',
          ),
        )
        .select(
          sql<
            number | null
          >`(SELECT img.id FROM images img WHERE img.entity_type = 'substrate' AND img.entity_id = s.id ORDER BY img.upload_date DESC, img.id DESC LIMIT 1)`.as(
            'cover_id',
          ),
        ),
      {
        column: byName ? 's.name' : 's.created_at',
        idColumn: 's.id',
        direction: byName ? 'asc' : 'desc',
        cursor: params.cursor,
        limit: params.limit,
        collateNoCase: byName,
      },
    ).execute();

    const page = toPage(rows, {
      limit: params.limit,
      sort: params.sort,
      key: (row) => ({ v: byName ? row.name : row.created_at, id: row.id }),
    });

    const coverIds = page.items.flatMap((row) => (row.cover_id === null ? [] : [row.cover_id]));
    const covers = new Map<number, ImageDTO>();
    if (coverIds.length) {
      const images = await getKysely()
        .selectFrom('images')
        .select([...IMAGE_COLUMNS])
        .where('id', 'in', coverIds)
        .execute();
      for (const image of images) covers.set(image.id, imageRowToDto(image));
    }

    const items = page.items.map((row): SubstrateListItem => ({
      id: row.id,
      name: row.name,
      user_id: row.user_id,
      is_public: row.is_public === 1,
      created_at: row.created_at * MS_PER_SECOND,
      cover: row.cover_id === null ? null : (covers.get(row.cover_id) ?? null),
      component_count: row.component_count,
    }));

    if (params.cursor) return { items, nextCursor: page.nextCursor };
    const counted = await filteredSubstrates(scope, params)
      .select(sql<number>`COUNT(*)`.as('total'))
      .executeTakeFirstOrThrow();
    return { items, nextCursor: page.nextCursor, total: counted.total };
  }
}
