/**
 * modules/plants/domain/Plant.ts
 *
 * The Plant entity and PlantRepository interface.
 *
 * Plant is a proper entity. PlantRepository is a pure interface: the
 * infrastructure layer (SQLite) implements it without the domain knowing
 * anything about SQL or the database driver.
 */

import type { Cursor } from '../../../core/pagination';
import type { ImageDTO } from '../../images/presentation/imageDto';
import type { WateringSummary } from './wateringSummary';

export type PlantSort = 'created' | 'name';
export type PlantScope = 'mine' | 'public';

// ── Value types ───────────────────────────────────────────────────────────────

export interface SubstrateRef {
  substrate_id: number;
  substrate_name: string;
}

/** One row of the paged list; `created_at` is epoch milliseconds. */
export interface PlantListItem {
  plant_id: number;
  plant_name: string;
  user_id: number;
  is_public: boolean;
  created_at: number;
  species_name: string | null;
  substrate: SubstrateRef | null;
  cover: ImageDTO | null;
  image_count: number;
  /** Only for the owner's own list and detail; null for public items. */
  watering: WateringSummary | null;
}

export interface PlantData extends PlantListItem {
  /** Oldest first. */
  images: ImageDTO[];
}

// ── Entity ────────────────────────────────────────────────────────────────────

export class Plant {
  public readonly id: number;
  public readonly userId: number;
  public readonly name: string;
  public readonly species: string | null;
  public readonly isPublic: boolean;
  public readonly createdAt: number;
  public readonly substrate: SubstrateRef | null;
  public readonly cover: ImageDTO | null;
  public readonly imageCount: number;
  public readonly watering: WateringSummary | null;
  public readonly images: ImageDTO[];

  constructor(data: PlantData) {
    this.id = data.plant_id;
    this.userId = data.user_id;
    this.name = data.plant_name;
    this.species = data.species_name;
    this.isPublic = Boolean(data.is_public);
    this.createdAt = data.created_at;
    this.substrate = data.substrate;
    this.cover = data.cover;
    this.imageCount = data.image_count;
    this.watering = data.watering;
    this.images = data.images;
  }

  /** Public plants are visible to everyone, private ones only to their owner. */
  isVisibleTo(userId: number | null): boolean {
    return this.isPublic || (userId !== null && this.userId === userId);
  }

  toJSON(): PlantData {
    return {
      plant_id: this.id,
      plant_name: this.name,
      user_id: this.userId,
      is_public: this.isPublic,
      created_at: this.createdAt,
      species_name: this.species,
      substrate: this.substrate,
      cover: this.cover,
      image_count: this.imageCount,
      watering: this.watering,
      images: this.images,
    };
  }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreatePlantDTO {
  name: string;
  species?: string | null;
  substrateId?: number | null;
  isPublic: boolean;
  userId: number;
}

export interface UpdatePlantDTO {
  name?: string;
  species?: string | null;
  substrateId?: number | null;
  isPublic?: boolean;
}

// ── Repository interface (no framework imports allowed here) ──────────────────

export interface PlantListQuery {
  limit: number;
  cursor: Cursor | null;
  q: string | null;
  sort: PlantSort;
}

export interface PlantListPage {
  items: PlantListItem[];
  nextCursor: string | null;
  /** Set on the first page only (no cursor). */
  total?: number;
}

export interface PlantRepository {
  /** The user's own plants with watering summaries; `tz` is minutes east of UTC. */
  listMine(userId: number, query: PlantListQuery, tz: number): Promise<PlantListPage>;
  /** Public plants of every owner; `watering` is always null. */
  listPublic(query: PlantListQuery): Promise<PlantListPage>;
  /** The watering summary is filled only when `viewerId` owns the plant. */
  findById(id: number, viewerId: number | null, tz: number): Promise<Plant | null>;
  create(dto: CreatePlantDTO): Promise<number>; // returns new plant ID
  update(id: number, userId: number, dto: UpdatePlantDTO): Promise<boolean>;
  delete(id: number, userId: number): Promise<boolean>;
  /** True when the substrate exists and is public or owned by the user. */
  isSubstrateUsableBy(substrateId: number, userId: number): Promise<boolean>;
}
