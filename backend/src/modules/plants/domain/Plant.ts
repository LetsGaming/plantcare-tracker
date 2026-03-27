/**
 * modules/plants/domain/Plant.ts
 *
 * The Plant entity and PlantRepository interface.
 *
 * V1 problem: plantModel.js returned raw DB rows as plain objects.
 * Business logic (combining public + private, dedup) was in the controller.
 *
 * V2: Plant is a proper entity. PlantRepository is a pure interface —
 * the infrastructure layer (MySQL) implements it without the domain
 * knowing anything about SQL or connection pools.
 */

// ── Value types ───────────────────────────────────────────────────────────────

export interface SubstrateRef {
  substrate_id: number;
  substrate_name: string;
}

export interface ImageRef {
  id: number;
  url: string;
  date: number;
}

export interface PlantData {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species: string;
  is_public: boolean;
  plant_created_at: number;
  image_url: string | null;
  substrate: SubstrateRef | null;
  images: ImageRef[];
}

// ── Entity ────────────────────────────────────────────────────────────────────

export class Plant {
  public readonly id: number;
  public readonly userId: number;
  public readonly name: string;
  public readonly species: string;
  public readonly isPublic: boolean;
  public readonly createdAt: number;
  public readonly imageUrl: string | null;
  public readonly substrate: SubstrateRef | null;
  public readonly images: ImageRef[];

  constructor(data: PlantData) {
    this.id = data.plant_id;
    this.userId = data.plant_user_id;
    this.name = data.plant_name;
    this.species = data.plant_species;
    this.isPublic = Boolean(data.is_public);
    this.createdAt = data.plant_created_at;
    this.imageUrl = data.image_url;
    this.substrate = data.substrate;
    this.images = data.images;
  }

  toJSON(): PlantData {
    return {
      plant_id: this.id,
      plant_user_id: this.userId,
      plant_name: this.name,
      plant_species: this.species,
      is_public: this.isPublic,
      plant_created_at: this.createdAt,
      image_url: this.imageUrl,
      substrate: this.substrate,
      images: this.images,
    };
  }
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreatePlantDTO {
  name: string;
  species: string;
  substrateId: number;
  isPublic: boolean;
  userId: number;
}

export interface UpdatePlantDTO {
  name?: string;
  species?: string;
  substrateId?: number;
  isPublic?: boolean;
}

// ── Repository interface (no framework imports allowed here) ──────────────────

export interface PlantRepository {
  findAllPublic(): Promise<Plant[]>;
  findAllByUser(userId: number): Promise<Plant[]>;
  findById(id: number): Promise<Plant | null>;
  create(dto: CreatePlantDTO): Promise<number>; // returns new plant ID
  update(id: number, userId: number, dto: UpdatePlantDTO): Promise<boolean>;
  delete(id: number, userId: number): Promise<boolean>;
}
