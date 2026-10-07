import { getKysely } from '../../../core/database/db';
import type { ComponentData, FinenessLevel, ComponentRepository } from '../domain/Component';

interface ComponentRow {
  component_id: number;
  component_name: string;
  fineness_id: number;
  fineness_name: string;
  image_id: number | null;
  image_url: string | null;
  upload_date: number | null;
}

const componentRows = () =>
  getKysely()
    .selectFrom('components as c')
    .innerJoin('fineness_levels as fl', 'c.fineness_id', 'fl.id')
    .leftJoin('images as img', (join) =>
      join.onRef('img.entity_id', '=', 'c.id').on('img.entity_type', '=', 'component'),
    )
    .select([
      'c.id as component_id',
      'c.name as component_name',
      'c.fineness_id',
      'fl.name as fineness_name',
      'img.id as image_id',
      'img.image_url',
      'img.upload_date',
    ]);

export class SQLiteComponentRepository implements ComponentRepository {
  async findAll(): Promise<ComponentData[]> {
    return this.groupRows(await componentRows().orderBy('c.name').execute());
  }

  async findById(id: number): Promise<ComponentData | null> {
    const rows = await componentRows().where('c.id', '=', id).execute();
    return this.groupRows(rows)[0] ?? null;
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

  private groupRows(rows: ComponentRow[]): ComponentData[] {
    const map = new Map<number, ComponentData>();

    for (const row of rows) {
      if (!map.has(row.component_id)) {
        map.set(row.component_id, {
          component_id: row.component_id,
          component_name: row.component_name,
          fineness_id: row.fineness_id,
          component_fineness: row.fineness_name,
          image_url: null,
          images: [],
        });
      }
      const c = map.get(row.component_id)!;

      if (row.image_id && !c.images.find((i) => i.id === row.image_id)) {
        c.images.push({ id: row.image_id, url: row.image_url ?? '', date: row.upload_date ?? 0 });
        c.image_url = row.image_url ?? null;
      }
    }

    return Array.from(map.values());
  }
}
