import { query, execute } from "../../../core/database/db";
import type {
  ComponentData,
  FinenessLevel,
  ComponentRepository,
} from "../domain/Component";

type SqlParam = string | number | boolean | null;

interface ComponentRow {
  component_id: number;
  component_name: string;
  fineness_id: number;
  fineness_name: string;
  image_id: number | null;
  image_url: string | null;
  upload_date: number | null;
}

// ── Base query using consolidated images ───────────────────────────────
const BASE_QUERY = `
  SELECT
    c.id AS component_id, c.name AS component_name,
    c.fineness_id, fl.name AS fineness_name,
    img.id AS image_id, img.image_url, img.upload_date
  FROM components c
  JOIN fineness_levels fl ON c.fineness_id = fl.id
  LEFT JOIN images img ON img.entity_type = 'component' AND img.entity_id = c.id
`;

export class SQLiteComponentRepository implements ComponentRepository {
  async findAll(): Promise<ComponentData[]> {
    const rows = query<ComponentRow>(`${BASE_QUERY} ORDER BY c.name`);
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<ComponentData | null> {
    const rows = query<ComponentRow>(`${BASE_QUERY} WHERE c.id = ?`, [id]);
    const result = this.groupRows(rows);
    return result[0] ?? null;
  }

  async findFinenessLevels(): Promise<FinenessLevel[]> {
    const rows = query<{ id: number; name: string }>(
      "SELECT id, name FROM fineness_levels",
    );
    return rows.map((r) => ({ fineness_id: r.id, fineness_name: r.name }));
  }

  async create(name: string, finenessId: number): Promise<number> {
    const result = execute(
      "INSERT INTO components (name, fineness_id) VALUES (?, ?)",
      [name, finenessId],
    );
    return result.insertId as number;
  }

  async update(
    id: number,
    fields: { name?: string; fineness?: number },
  ): Promise<boolean> {
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (fields.name !== undefined) {
      updates.push("name = ?");
      params.push(fields.name);
    }
    if (fields.fineness !== undefined && Number.isInteger(fields.fineness) && fields.fineness > 0) {
      updates.push("fineness_id = ?");
      params.push(fields.fineness);
    }
    if (!updates.length) return false;

    params.push(id);
    const result = execute(
      `UPDATE components SET ${updates.join(", ")} WHERE id = ?`,
      params,
    );
    return result.affectedRows > 0;
  }

  async delete(id: number): Promise<boolean> {
    const result = execute("DELETE FROM components WHERE id = ?", [id]);
    return result.affectedRows > 0;
  }

  // ── Helper: group rows into ComponentData ───────────────────────────
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
        const imageRef = {
          id: row.image_id,
          url: row.image_url ?? "",
          date: row.upload_date ?? 0,
        };
        c.images.push(imageRef);
        c.image_url = row.image_url ?? null;
      }
    }

    return Array.from(map.values());
  }
}
