import { query, execute } from "../../../core/database/db";
import type {
  PlantRepository,
  CreatePlantDTO,
  UpdatePlantDTO,
} from "../domain/Plant";
import { Plant } from "../domain/Plant";
import type { SubstrateRef, ImageRef } from "../domain/Plant";

type SqlParam = string | number | boolean | null;

// ── Raw DB row ────────────────────────────────────────────────────────────────
interface PlantRow {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species_id: number | null;
  plant_species_name: string | null;
  is_public: number;
  plant_created_at: number;
  substrate_id: number | null;
  substrate_name: string | null;
  image_id: number | null;
  image_url: string | null;
  upload_date: number | null;
}

// ── Base query using consolidated images ───────────────────────────────────────
const BASE_QUERY = `
  SELECT
    p.id            AS plant_id,
    p.user_id       AS plant_user_id,
    p.name          AS plant_name,
    p.species_id    AS plant_species_id,
    p.created_at    AS plant_created_at,
    p.is_public     AS is_public,
    species.name    AS plant_species_name,
    s.id            AS substrate_id,
    s.name          AS substrate_name,
    img.id          AS image_id,
    REPLACE(img.image_url, '\\', '/') AS image_url,
    img.upload_date
  FROM plants p
  LEFT JOIN species           ON p.species_id = species.id
  LEFT JOIN substrates s      ON p.substrate_id = s.id
  LEFT JOIN images img        ON img.entity_type = 'plant' AND img.entity_id = p.id
`;

// ── Repository ───────────────────────────────────────────────────────────────
export class SQLitePlantRepository implements PlantRepository {
  async findAllPublic(): Promise<Plant[]> {
    const rows = query<PlantRow>(
      `${BASE_QUERY} WHERE p.is_public = 1 ORDER BY p.created_at DESC`,
    );
    return this.groupRows(rows);
  }

  async findAllByUser(userId: number): Promise<Plant[]> {
    const rows = query<PlantRow>(
      `${BASE_QUERY} WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [userId],
    );
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<Plant | null> {
    const rows = query<PlantRow>(`${BASE_QUERY} WHERE p.id = ?`, [id]);
    const plants = this.groupRows(rows);
    return plants[0] ?? null;
  }

  async create(dto: CreatePlantDTO): Promise<number> {
    const result = execute(
      `INSERT INTO plants (name, species_id, substrate_id, is_public, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))`,
      [
        dto.name,
        dto.species ?? null,
        dto.substrateId ?? null,
        dto.isPublic ? 1 : 0,
        dto.userId,
      ],
    );

    return result.insertId as number;
  }

  async update(
    id: number,
    userId: number,
    dto: UpdatePlantDTO,
  ): Promise<boolean> {
    const updates: string[] = [];
    const params: SqlParam[] = [];

    if (dto.name !== undefined) {
      updates.push("name = ?");
      params.push(dto.name);
    }
    if (dto.species !== undefined) {
      updates.push("species_id = ?");
      params.push(dto.species);
    }
    if (dto.substrateId !== undefined) {
      updates.push("substrate_id = ?");
      params.push(dto.substrateId);
    }
    if (dto.isPublic !== undefined) {
      updates.push("is_public = ?");
      params.push(dto.isPublic ? 1 : 0);
    }

    if (updates.length === 0) return false;

    params.push(id, userId);

    const result = execute(
      `UPDATE plants SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      params,
    );

    return result.affectedRows > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = execute("DELETE FROM plants WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);
    return result.affectedRows > 0;
  }

  // ── Collapse JOIN rows into Plant entities ────────────────────────────────
  private groupRows(rows: PlantRow[]): Plant[] {
    const map = new Map<number, { data: PlantRow; images: ImageRef[] }>();

    for (const row of rows) {
      if (!map.has(row.plant_id)) {
        map.set(row.plant_id, { data: row, images: [] });
      }
      if (row.image_id && row.image_url) {
        map.get(row.plant_id)!.images.push({
          id: row.image_id,
          url: row.image_url,
          date: row.upload_date ?? 0,
        });
      }
    }

    return Array.from(map.values()).map(({ data, images }) => {
      const substrate: SubstrateRef | null = data.substrate_id
        ? {
            substrate_id: data.substrate_id,
            substrate_name: data.substrate_name ?? "",
          }
        : null;

      const latestImage =
        images.length > 0 ? images[images.length - 1].url : null;

      return new Plant({
        plant_id: data.plant_id,
        plant_user_id: data.plant_user_id,
        plant_name: data.plant_name,
        plant_species: data.plant_species_name ?? "Unknown",
        is_public: Boolean(data.is_public),
        plant_created_at: data.plant_created_at,
        image_url: latestImage,
        substrate,
        images,
      });
    });
  }
}
