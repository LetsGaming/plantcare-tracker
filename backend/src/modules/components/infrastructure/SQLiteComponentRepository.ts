import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import { toPublicImageUrl } from '../../../core/config';
import { applyKeyset, containsLike, toPage, type Page } from '../../../core/pagination';
import { toImageDto, type ImageDTO } from '../../images/presentation/imageDto';
import type {
  ComponentDetail,
  ComponentListItem,
  ComponentPageQuery,
  ComponentRepository,
  FinenessLevel,
} from '../domain/Component';

interface ImageRow {
  id: number;
  image_url: string;
  upload_date: number;
  variants: number;
  width: number | null;
  height: number | null;
  placeholder: string | null;
}

const toDto = (row: ImageRow): ImageDTO =>
  toImageDto({
    id: row.id,
    url: toPublicImageUrl(row.image_url),
    date: row.upload_date,
    variants: row.variants,
    width: row.width,
    height: row.height,
    placeholder: row.placeholder,
  });

const componentImages = () =>
  getKysely()
    .selectFrom('images')
    .select(['id', 'image_url', 'upload_date', 'variants', 'width', 'height', 'placeholder'])
    .where('entity_type', '=', 'component');

export class SQLiteComponentRepository implements ComponentRepository {
  async findPage(query: ComponentPageQuery, sort: string): Promise<Page<ComponentListItem>> {
    let qb = getKysely()
      .selectFrom('components as c')
      .innerJoin('fineness_levels as fl', 'c.fineness_id', 'fl.id')
      .select([
        'c.id',
        'c.name',
        'c.fineness_id',
        'fl.name as fineness_name',
        sql<number | null>`(
          SELECT i.id FROM images i
          WHERE i.entity_type = 'component' AND i.entity_id = c.id
          ORDER BY i.upload_date DESC, i.id DESC LIMIT 1
        )`.as('cover_id'),
      ]);
    if (query.q) qb = qb.where(containsLike('c.name', query.q));

    const rows = await applyKeyset(qb, {
      column: 'c.name',
      idColumn: 'c.id',
      direction: 'asc',
      cursor: query.cursor ? { s: sort, ...query.cursor } : null,
      limit: query.limit,
      collateNoCase: true,
    }).execute();

    const page = toPage(rows, {
      limit: query.limit,
      sort,
      key: (row) => ({ v: row.name, id: row.id }),
    });

    const coverIds = page.items.flatMap((r) => (r.cover_id === null ? [] : [r.cover_id]));
    const covers = new Map<number, ImageDTO>();
    if (coverIds.length) {
      const imageRows = await componentImages().where('id', 'in', coverIds).execute();
      for (const row of imageRows) covers.set(row.id, toDto(row));
    }

    return {
      nextCursor: page.nextCursor,
      items: page.items.map((r) => ({
        id: r.id,
        name: r.name,
        fineness_id: r.fineness_id,
        fineness_name: r.fineness_name,
        cover: r.cover_id === null ? null : (covers.get(r.cover_id) ?? null),
      })),
    };
  }

  async count(q: string | null): Promise<number> {
    let qb = getKysely()
      .selectFrom('components as c')
      .select(sql<number>`COUNT(*)`.as('n'));
    if (q) qb = qb.where(containsLike('c.name', q));
    const row = await qb.executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async findById(id: number): Promise<ComponentDetail | null> {
    const row = await getKysely()
      .selectFrom('components as c')
      .innerJoin('fineness_levels as fl', 'c.fineness_id', 'fl.id')
      .select(['c.id', 'c.name', 'c.fineness_id', 'fl.name as fineness_name'])
      .where('c.id', '=', id)
      .executeTakeFirst();
    if (!row) return null;

    const imageRows = await componentImages()
      .where('entity_id', '=', id)
      .orderBy('upload_date')
      .orderBy('id')
      .execute();
    const images = imageRows.map(toDto);
    return { ...row, cover: images[images.length - 1] ?? null, images };
  }

  async findFinenessLevels(): Promise<FinenessLevel[]> {
    const rows = await getKysely().selectFrom('fineness_levels').select(['id', 'name']).execute();
    return rows.map((r) => ({ fineness_id: r.id, fineness_name: r.name }));
  }

  async create(name: string, finenessId: number): Promise<number> {
    const result = await getKysely()
      .insertInto('components')
      .values({ name, fineness_id: finenessId })
      .executeTakeFirstOrThrow();
    return Number(result.insertId);
  }

  async update(id: number, fields: { name?: string; fineness?: number }): Promise<boolean> {
    const changes: { name?: string; fineness_id?: number } = {};
    if (fields.name !== undefined) changes.name = fields.name;
    if (fields.fineness !== undefined && Number.isInteger(fields.fineness) && fields.fineness > 0) {
      changes.fineness_id = fields.fineness;
    }
    if (!Object.keys(changes).length) return false;

    const result = await getKysely()
      .updateTable('components')
      .set(changes)
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('components')
      .where('id', '=', id)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
