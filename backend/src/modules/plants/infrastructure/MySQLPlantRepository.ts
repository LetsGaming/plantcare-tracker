/**
 * modules/plants/infrastructure/MySQLPlantRepository.ts
 *
 * Implements PlantRepository using MySQL via mysql2.
 *
 * Key V1 improvement: selectPlants() made N+1 DB calls —
 * for each plant it called selectSubstrate() AND selectEntityImages().
 * With 50 plants that's 101 queries.
 *
 * V2: Single JOIN query fetches all data at once.
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';

type SqlParams = (string | number | boolean | null | Date)[];
import type { PlantRepository, CreatePlantDTO, UpdatePlantDTO } from '../domain/Plant';
import { Plant } from '../domain/Plant';
import type { SubstrateRef, ImageRef } from '../domain/Plant';

// ── Raw DB row types ──────────────────────────────────────────────────────────

interface PlantRow extends RowDataPacket {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species: string;
  is_public: number;
  plant_created_at: string;
  substrate_id: number | null;
  substrate_name: string | null;
  image_id: number | null;
  image_url: string | null;
  upload_date: string | null;
}

// ── Repository implementation ─────────────────────────────────────────────────

export class MySQLPlantRepository implements PlantRepository {
  constructor(private readonly pool: Pool) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  private readonly BASE_QUERY = `
    SELECT
      p.id            AS plant_id,
      p.user_id       AS plant_user_id,
      p.name          AS plant_name,
      p.species       AS plant_species,
      p.is_public,
      p.created_at    AS plant_created_at,
      s.id            AS substrate_id,
      s.name          AS substrate_name,
      img.id          AS image_id,
      REPLACE(REPLACE(img.image_url, '\\\\', '/'), '://', '://')
                      AS image_url,
      img.upload_date
    FROM plants p
    LEFT JOIN substrates s    ON p.substrate_id = s.id
    LEFT JOIN plant_images pi  ON pi.plant_id = p.id
    LEFT JOIN images img       ON img.id = pi.image_id
  `;

  async findAllPublic(): Promise<Plant[]> {
    const [rows] = await this.pool.query<PlantRow[]>(
      `${this.BASE_QUERY} WHERE p.is_public = 1 ORDER BY p.created_at DESC`,
    );
    return this.groupRows(rows);
  }

  async findAllByUser(userId: number): Promise<Plant[]> {
    const [rows] = await this.pool.query<PlantRow[]>(
      `${this.BASE_QUERY} WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [userId],
    );
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<Plant | null> {
    const [rows] = await this.pool.query<PlantRow[]>(
      `${this.BASE_QUERY} WHERE p.id = ?`,
      [id],
    );
    const plants = this.groupRows(rows);
    return plants[0] ?? null;
  }

  async create(dto: CreatePlantDTO): Promise<number> {
    const [result] = await this.pool.execute(
      'INSERT INTO plants (name, species, substrate_id, is_public, user_id) VALUES (?, ?, ?, ?, ?)',
      [dto.name, dto.species, dto.substrateId, dto.isPublic ? 1 : 0, dto.userId],
    );
    return (result as { insertId: number }).insertId;
  }

  async update(id: number, userId: number, dto: UpdatePlantDTO): Promise<boolean> {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) { updates.push('name = ?'); params.push(dto.name); }
    if (dto.species !== undefined) { updates.push('species = ?'); params.push(dto.species); }
    if (dto.substrateId !== undefined) { updates.push('substrate_id = ?'); params.push(dto.substrateId); }
    if (dto.isPublic !== undefined) { updates.push('is_public = ?'); params.push(dto.isPublic ? 1 : 0); }

    if (updates.length === 0) return false;

    params.push(id, userId);
    const [result] = await this.pool.execute(
      `UPDATE plants SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      params as SqlParams,
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const [result] = await this.pool.execute(
      'DELETE FROM plants WHERE id = ? AND user_id = ?',
      [id, userId],
    );
    return (result as { affectedRows: number }).affectedRows > 0;
  }

  // ── Private: collapse JOIN rows into Plant entities ────────────────────────

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
          date: row.upload_date ?? '',
        });
      }
    }

    return Array.from(map.values()).map(({ data, images }) => {
      const substrate: SubstrateRef | null =
        data.substrate_id
          ? { substrate_id: data.substrate_id, substrate_name: data.substrate_name ?? '' }
          : null;

      const latestImage = images.length > 0 ? images[images.length - 1].url : null;

      return new Plant({
        plant_id: data.plant_id,
        plant_user_id: data.plant_user_id,
        plant_name: data.plant_name,
        plant_species: data.plant_species,
        is_public: Boolean(data.is_public),
        plant_created_at: data.plant_created_at,
        image_url: latestImage,
        substrate,
        images,
      });
    });
  }
}
