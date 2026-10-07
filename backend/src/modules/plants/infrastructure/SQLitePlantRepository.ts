import { sql } from 'kysely';
import { getKysely } from '../../../core/database/db';
import type { SpeciesResolver } from '../domain/SpeciesResolver';
import type { PlantRepository, CreatePlantDTO, UpdatePlantDTO } from '../domain/Plant';
import { Plant } from '../domain/Plant';
import type { SubstrateRef, ImageRef } from '../domain/Plant';

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

/** Image URLs stored by older releases may contain Windows path separators. */
const WINDOWS_SEPARATOR = '\\';

const plantRows = () =>
  getKysely()
    .selectFrom('plants as p')
    .leftJoin('species', 'p.species_id', 'species.id')
    .leftJoin('substrates as s', 'p.substrate_id', 's.id')
    .leftJoin('images as img', (join) =>
      join.onRef('img.entity_id', '=', 'p.id').on('img.entity_type', '=', 'plant'),
    )
    .select([
      'p.id as plant_id',
      'p.user_id as plant_user_id',
      'p.name as plant_name',
      'p.species_id as plant_species_id',
      'p.created_at as plant_created_at',
      'p.is_public as is_public',
      'species.name as plant_species_name',
      's.id as substrate_id',
      's.name as substrate_name',
      'img.id as image_id',
      sql<string | null>`REPLACE(img.image_url, ${WINDOWS_SEPARATOR}, '/')`.as('image_url'),
      'img.upload_date',
    ]);

// ── Repository ───────────────────────────────────────────────────────────────
export class SQLitePlantRepository implements PlantRepository {
  constructor(private readonly species: SpeciesResolver) {}

  async findAllPublic(): Promise<Plant[]> {
    const rows = await plantRows()
      .where('p.is_public', '=', 1)
      .orderBy('p.created_at', 'desc')
      .execute();
    return this.groupRows(rows);
  }

  async findAllByUser(userId: number): Promise<Plant[]> {
    const rows = await plantRows()
      .where('p.user_id', '=', userId)
      .orderBy('p.created_at', 'desc')
      .execute();
    return this.groupRows(rows);
  }

  async findById(id: number): Promise<Plant | null> {
    const rows = await plantRows().where('p.id', '=', id).execute();
    return this.groupRows(rows)[0] ?? null;
  }

  async create(dto: CreatePlantDTO): Promise<number> {
    const speciesId = await this.species.resolve(dto.species);
    const result = await getKysely()
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
  }

  async update(id: number, userId: number, dto: UpdatePlantDTO): Promise<boolean> {
    const changes: {
      name?: string;
      species_id?: number | null;
      substrate_id?: number;
      is_public?: number;
    } = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.species !== undefined) changes.species_id = await this.species.resolve(dto.species);
    if (dto.substrateId !== undefined) changes.substrate_id = dto.substrateId;
    if (dto.isPublic !== undefined) changes.is_public = dto.isPublic ? 1 : 0;
    if (Object.keys(changes).length === 0) return false;

    const result = await getKysely()
      .updateTable('plants')
      .set(changes)
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async delete(id: number, userId: number): Promise<boolean> {
    const result = await getKysely()
      .deleteFrom('plants')
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
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
            substrate_name: data.substrate_name ?? '',
          }
        : null;

      const latestImage = images.length > 0 ? images[images.length - 1].url : null;

      return new Plant({
        plant_id: data.plant_id,
        plant_user_id: data.plant_user_id,
        plant_name: data.plant_name,
        plant_species: data.plant_species_name ?? 'Unknown',
        is_public: Boolean(data.is_public),
        plant_created_at: data.plant_created_at,
        image_url: latestImage,
        substrate,
        images,
      });
    });
  }
}
