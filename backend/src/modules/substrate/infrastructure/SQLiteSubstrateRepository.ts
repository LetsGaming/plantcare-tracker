import { query, execute, transaction } from "../../../core/database/db";
import type {
  SubstrateRepository,
  SubstrateData,
  ImageRef,
} from "../domain/Substrate";

type SqlParam = string | number | boolean | null;

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

// ── Base query using consolidated images ───────────────────────────────
const BASE_QUERY = `
  SELECT
    s.id AS substrate_id, s.user_id AS substrate_user_id,
    s.name AS substrate_name, s.is_public, s.created_at AS substrate_created_at,
    sc.component_id, c.name AS component_name, fl.name AS component_fineness_name,
    sc.parts AS component_parts,
    img.id AS image_id, img.image_url, img.upload_date
  FROM substrates s
  LEFT JOIN substrate_components sc ON s.id = sc.substrate_id
  LEFT JOIN components c            ON sc.component_id = c.id
  LEFT JOIN fineness_levels fl      ON c.fineness_id = fl.id
  LEFT JOIN images img              ON img.entity_type = 'substrate' AND img.entity_id = s.id
`;

export class SQLiteSubstrateRepository implements SubstrateRepository {
  async findAllPublic(): Promise<SubstrateData[]> {
    const rows = query<SubstrateRow>(`${BASE_QUERY} WHERE s.is_public = 1`);
    return this.groupRows(rows);
  }

  async findAllByUser(userId: number): Promise<SubstrateData[]> {
    const rows = query<SubstrateRow>(`${BASE_QUERY} WHERE s.user_id = ?`, [
      userId,
    ]);
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<SubstrateData | null> {
    const rows = query<SubstrateRow>(`${BASE_QUERY} WHERE s.id = ?`, [id]);
    const result = this.groupRows(rows);
    return result[0] ?? null;
  }

  async create(
    name: string,
    userId: number,
    isPublic: boolean,
  ): Promise<number> {
    const result = execute(
      "INSERT INTO substrates (name, user_id, is_public, created_at) VALUES (?, ?, ?, strftime('%s','now'))",
      [name, userId, isPublic ? 1 : 0],
    );
    return result.insertId as number;
  }

  async update(
    id: number,
    userId: number,
    fields: { name?: string; isPublic?: boolean },
  ): Promise<boolean> {
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (fields.name !== undefined) {
      updates.push("name = ?");
      params.push(fields.name);
    }
    if (fields.isPublic !== undefined) {
      updates.push("is_public = ?");
      params.push(fields.isPublic ? 1 : 0);
    }
    if (!updates.length) return false;

    params.push(id, userId);
    const result = execute(
      `UPDATE substrates SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      params,
    );
    return result.affectedRows > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = execute(
      "DELETE FROM substrates WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    return result.affectedRows > 0;
  }

  async addComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void> {
    transaction(({ execute: exec }) => {
      for (const { componentId, parts } of components) {
        exec(
          "INSERT INTO substrate_components (substrate_id, component_id, parts) VALUES (?, ?, ?)",
          [substrateId, componentId, Math.round(parts * 100) / 100],
        );
      }
    });
  }

  async upsertComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void> {
    transaction(({ execute: exec }) => {
      for (const { componentId, parts } of components) {
        exec(
          `INSERT OR REPLACE INTO substrate_components (substrate_id, component_id, parts)
           VALUES (?, ?, ?)`,
          [substrateId, componentId, Math.round(parts * 100) / 100],
        );
      }
    });
  }

  async deleteComponents(
    substrateId: number,
    componentIds: number[],
  ): Promise<void> {
    if (!componentIds.length) return;
    const placeholders = componentIds.map(() => "?").join(", ");
    execute(
      `DELETE FROM substrate_components WHERE substrate_id = ? AND component_id IN (${placeholders})`,
      [substrateId, ...componentIds],
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────
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

      if (
        row.component_id &&
        !s.components.find((c) => c.component_id === row.component_id)
      ) {
        s.components.push({
          component_id: row.component_id,
          component_name: row.component_name ?? "",
          component_fineness: row.component_fineness_name ?? "",
          component_parts: row.component_parts ?? 0,
        });
      }

      if (row.image_id && !s.images.find((i) => i.id === row.image_id)) {
        const imageRef: ImageRef = {
          id: row.image_id,
          url: row.image_url ?? "",
          date: row.upload_date ?? 0,
        };
        s.images.push(imageRef);
        s.image_url = imageRef.url;
      }
    }

    return Array.from(map.values());
  }
}
