import { sql, type Kysely, type RawBuilder, type SqlBool } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { Database } from '../../../core/database/schema';
import { applyKeyset, containsLike, toPage, type KeysetOptions } from '../../../core/pagination';
import type { ImageDTO } from '../../images/domain/imageDto';
import { IMAGE_COLUMNS, imageRowToDto } from '../../images/infrastructure/imageRows';
import {
  summaryColumns,
  summaryFromRow,
  type SummaryColumns,
  type SummaryRow,
} from '../../watering/infrastructure/wateringSummary';
import type { SpeciesResolver } from '../domain/SpeciesResolver';
import type {
  PlantRepository,
  CreatePlantDTO,
  UpdatePlantDTO,
  PlantListItem,
  PlantListPage,
  PlantListQuery,
  PlantOwnership,
  PlantSort,
  SubstrateRef,
} from '../domain/Plant';
import { Plant } from '../domain/Plant';

const MS_PER_SECOND = 1000;

interface PlantBaseRow {
  plant_id: number;
  plant_name: string;
  user_id: number;
  is_public: number;
  created_at: number;
  species_name: string | null;
  substrate_id: number | null;
  substrate_name: string | null;
}

interface ListRow extends PlantBaseRow, Partial<SummaryRow> {
  cover_id: number | null;
  image_count: number;
}

const hasSummary = (row: ListRow): row is ListRow & SummaryRow =>
  row.distinct_local_days !== undefined;

type ListScope = { kind: 'mine'; userId: number } | { kind: 'public' };

const SORT_KEYSET: Record<
  PlantSort,
  Pick<KeysetOptions, 'column' | 'direction' | 'collateNoCase'>
> = {
  created: { column: 'p.created_at', direction: 'desc' },
  name: { column: 'p.name', direction: 'asc', collateNoCase: true },
};

const toSubstrate = (row: PlantBaseRow): SubstrateRef | null =>
  row.substrate_id
    ? { substrate_id: row.substrate_id, substrate_name: row.substrate_name ?? '' }
    : null;

/** Wraps each summary subquery so SQLite evaluates it only for the viewer's own plant. */
const ownerOnly = (
  columns: SummaryColumns,
  viewerId: number | null,
): { [K in keyof SummaryColumns]: RawBuilder<number | null> } => {
  const guard = <T>(column: RawBuilder<T>): RawBuilder<T | null> =>
    sql<T | null>`CASE WHEN p.user_id = ${viewerId} THEN ${column} END`;
  return {
    last_watered_sec: guard(columns.last_watered_sec),
    last_fertilized_sec: guard(columns.last_fertilized_sec),
    first_watered_sec: guard(columns.first_watered_sec),
    distinct_local_days: guard(columns.distinct_local_days),
  };
};

const newestImageId = sql<
  number | null
>`(SELECT i.id FROM images i WHERE i.entity_type = 'plant' AND i.entity_id = p.id ORDER BY i.upload_date DESC, i.id DESC LIMIT 1)`;
const imageCount = sql<number>`(SELECT COUNT(*) FROM images i WHERE i.entity_type = 'plant' AND i.entity_id = p.id)`;

/** A private substrate stays hidden from everyone but its owner and the owner of the plant that uses it. */
const visibleSubstrate = (viewerId: number | null) =>
  sql<SqlBool>`(s.is_public = 1 OR s.user_id = ${viewerId} OR p.user_id = ${viewerId})`;

const scopePredicate = (scope: ListScope) =>
  scope.kind === 'mine' ? sql<SqlBool>`p.user_id = ${scope.userId}` : sql<SqlBool>`p.is_public = 1`;

/** Plants with their species, filtered by scope and search. The public predicate is a literal so the partial indexes apply. */
const filteredPlants = (scope: ListScope, q: string | null) => {
  let qb = getKysely()
    .selectFrom('plants as p')
    .leftJoin('species', 'p.species_id', 'species.id')
    .where(scopePredicate(scope));
  if (q) {
    qb = qb.where((eb) =>
      scope.kind === 'mine'
        ? eb.or([containsLike('p.name', q), containsLike('species.name', q)])
        : containsLike('p.name', q),
    );
  }
  return qb;
};

/** The total joins species only when the species name is searched (mine with q). */
const countPlants = (scope: ListScope, q: string | null) => {
  const base = getKysely().selectFrom('plants as p');
  if (q && scope.kind === 'mine') {
    return base
      .leftJoin('species', 'p.species_id', 'species.id')
      .where(scopePredicate(scope))
      .where((eb) => eb.or([containsLike('p.name', q), containsLike('species.name', q)]))
      .select(sql<number>`COUNT(*)`.as('n'));
  }
  let qb = base.where(scopePredicate(scope));
  if (q) qb = qb.where(containsLike('p.name', q));
  return qb.select(sql<number>`COUNT(*)`.as('n'));
};

// ── Repository ───────────────────────────────────────────────────────────────
export class SQLitePlantRepository implements PlantRepository {
  /** Builds a resolver on the given executor so a species insert and the plant write share a transaction. */
  constructor(private readonly speciesFor: (db: Kysely<Database>) => SpeciesResolver) {}

  listMine(userId: number, query: PlantListQuery, tz: number): Promise<PlantListPage> {
    return this.list({ kind: 'mine', userId }, query, tz);
  }

  listPublic(query: PlantListQuery): Promise<PlantListPage> {
    return this.list({ kind: 'public' }, query, null);
  }

  /** `tz` is null for scopes without watering summaries. */
  private async list(
    scope: ListScope,
    query: PlantListQuery,
    tz: number | null,
  ): Promise<PlantListPage> {
    const cursor = query.cursor;
    const selected = filteredPlants(scope, query.q)
      .leftJoin('substrates as s', (join) =>
        join
          .onRef('p.substrate_id', '=', 's.id')
          .on(visibleSubstrate(scope.kind === 'mine' ? scope.userId : null)),
      )
      .select([
        'p.id as plant_id',
        'p.name as plant_name',
        'p.user_id as user_id',
        'p.is_public as is_public',
        'p.created_at as created_at',
        'species.name as species_name',
        's.id as substrate_id',
        's.name as substrate_name',
        newestImageId.as('cover_id'),
        imageCount.as('image_count'),
      ])
      .$if(tz !== null, (qb) => {
        const summary = summaryColumns('p.id', tz as number);
        return qb.select([
          summary.last_watered_sec.as('last_watered_sec'),
          summary.last_fertilized_sec.as('last_fertilized_sec'),
          summary.first_watered_sec.as('first_watered_sec'),
          summary.distinct_local_days.as('distinct_local_days'),
        ]);
      });

    const rows: ListRow[] = await applyKeyset(selected, {
      ...SORT_KEYSET[query.sort],
      idColumn: 'p.id',
      cursor,
      limit: query.limit,
    }).execute();

    // The cursor carries the stored seconds and name, not the DTO values.
    const page = toPage(rows, {
      limit: query.limit,
      sort: query.sort,
      key: (row) => ({
        v: query.sort === 'name' ? row.plant_name : row.created_at,
        id: row.plant_id,
      }),
    });

    const covers = await this.loadCovers(page.items.map((row) => row.cover_id));
    const items = page.items.map((row): PlantListItem => ({
      plant_id: row.plant_id,
      plant_name: row.plant_name,
      user_id: row.user_id,
      is_public: Boolean(row.is_public),
      created_at: row.created_at * MS_PER_SECOND,
      species_name: row.species_name,
      substrate: toSubstrate(row),
      cover: row.cover_id === null ? null : (covers.get(row.cover_id) ?? null),
      image_count: row.image_count,
      watering: tz !== null && hasSummary(row) ? summaryFromRow(row, tz) : null,
    }));

    const result: PlantListPage = { items, nextCursor: page.nextCursor };
    if (query.cursor === null) {
      const counted = await countPlants(scope, query.q).executeTakeFirstOrThrow();
      result.total = counted.n;
    }
    return result;
  }

  private async loadCovers(coverIds: (number | null)[]): Promise<Map<number, ImageDTO>> {
    const ids = coverIds.filter((id): id is number => id !== null);
    const covers = new Map<number, ImageDTO>();
    if (ids.length === 0) return covers;
    const rows = await getKysely()
      .selectFrom('images')
      .select([...IMAGE_COLUMNS])
      .where('id', 'in', ids)
      .execute();
    for (const row of rows) covers.set(row.id, imageRowToDto(row));
    return covers;
  }

  async findById(id: number, viewerId: number | null, tz: number): Promise<Plant | null> {
    const summary = ownerOnly(summaryColumns('p.id', tz), viewerId);
    const row = await getKysely()
      .selectFrom('plants as p')
      .leftJoin('species', 'p.species_id', 'species.id')
      .leftJoin('substrates as s', (join) =>
        join.onRef('p.substrate_id', '=', 's.id').on(visibleSubstrate(viewerId)),
      )
      .select([
        'p.id as plant_id',
        'p.name as plant_name',
        'p.user_id as user_id',
        'p.is_public as is_public',
        'p.created_at as created_at',
        'species.name as species_name',
        's.id as substrate_id',
        's.name as substrate_name',
        summary.last_watered_sec.as('last_watered_sec'),
        summary.last_fertilized_sec.as('last_fertilized_sec'),
        summary.first_watered_sec.as('first_watered_sec'),
        summary.distinct_local_days.as('distinct_local_days'),
      ])
      .where('p.id', '=', id)
      .executeTakeFirst();
    if (!row) return null;

    const imageRows = await getKysely()
      .selectFrom('images')
      .select([...IMAGE_COLUMNS])
      .where('entity_type', '=', 'plant')
      .where('entity_id', '=', id)
      .orderBy('upload_date')
      .orderBy('id')
      .execute();
    const images = imageRows.map(imageRowToDto);

    return new Plant({
      plant_id: row.plant_id,
      plant_name: row.plant_name,
      user_id: row.user_id,
      is_public: Boolean(row.is_public),
      created_at: row.created_at * MS_PER_SECOND,
      species_name: row.species_name,
      substrate: toSubstrate(row),
      cover: images.length > 0 ? images[images.length - 1] : null,
      image_count: images.length,
      watering:
        viewerId !== null && viewerId === row.user_id
          ? summaryFromRow({ ...row, distinct_local_days: row.distinct_local_days ?? 0 }, tz)
          : null,
      images,
    });
  }

  async findOwnership(id: number): Promise<PlantOwnership | null> {
    const row = await getKysely()
      .selectFrom('plants')
      .select(['user_id', 'substrate_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { userId: row.user_id, substrateId: row.substrate_id } : null;
  }

  async create(dto: CreatePlantDTO): Promise<number> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const speciesId = await this.speciesFor(trx).resolve(dto.species);
        const result = await trx
          .insertInto('plants')
          .values({
            name: dto.name,
            species_id: speciesId,
            substrate_id: dto.substrateId ?? null,
            is_public: dto.isPublic ? 1 : 0,
            user_id: dto.userId,
            created_at: sql<number>`strftime('%s', 'now')`,
          })
          .executeTakeFirstOrThrow();
        return Number(result.insertId);
      });
  }

  async update(id: number, userId: number, dto: UpdatePlantDTO): Promise<boolean> {
    return getKysely()
      .transaction()
      .execute(async (trx) => {
        const changes: {
          name?: string;
          species_id?: number | null;
          substrate_id?: number | null;
          is_public?: number;
        } = {};
        if (dto.name !== undefined) changes.name = dto.name;
        if (dto.species !== undefined) {
          changes.species_id = await this.speciesFor(trx).resolve(dto.species);
        }
        if (dto.substrateId !== undefined) changes.substrate_id = dto.substrateId;
        if (dto.isPublic !== undefined) changes.is_public = dto.isPublic ? 1 : 0;
        if (Object.keys(changes).length === 0) return false;

        const result = await trx
          .updateTable('plants')
          .set(changes)
          .where('id', '=', id)
          .where('user_id', '=', userId)
          .executeTakeFirst();
        return Number(result.numUpdatedRows) > 0;
      });
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('plants')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async isSubstrateUsableBy(substrateId: number, userId: number): Promise<boolean> {
    const row = await getKysely()
      .selectFrom('substrates')
      .select('id')
      .where('id', '=', substrateId)
      .where((eb) => eb.or([eb('is_public', '=', 1), eb('user_id', '=', userId)]))
      .executeTakeFirst();
    return row !== undefined;
  }
}
