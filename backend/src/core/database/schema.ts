/**
 * core/database/schema.ts
 *
 * Table types for Kysely, mirroring the DDL in migrations/. Columns with a
 * database default are `Generated` so inserts may omit them.
 */

import type { Generated } from 'kysely';

export interface RolesTable {
  id: Generated<number>;
  name: string;
}

export interface UsersTable {
  id: Generated<number>;
  username: string;
  password: string;
  role_id: Generated<number>;
  created_at: Generated<number>;
}

export interface SpeciesTable {
  id: Generated<number>;
  name: string;
}

export interface FinenessLevelsTable {
  id: Generated<number>;
  name: string;
}

export interface ComponentsTable {
  id: Generated<number>;
  name: string;
  fineness_id: number;
}

export interface SubstratesTable {
  id: Generated<number>;
  name: string;
  user_id: number;
  is_public: Generated<number>;
  created_at: Generated<number>;
}

export interface PlantsTable {
  id: Generated<number>;
  name: string;
  species_id: number | null;
  substrate_id: number | null;
  user_id: number;
  is_public: Generated<number>;
  created_at: Generated<number>;
}

export interface ImagesTable {
  id: Generated<number>;
  image_url: string;
  entity_type: 'plant' | 'substrate' | 'component';
  entity_id: number;
  upload_date: Generated<number>;
}

export interface ImageEmbeddingsTable {
  image_id: number;
  model: string;
  vector: Buffer;
}

export interface FertilizerTypesTable {
  id: Generated<number>;
  name: string;
}

export interface WateringRecordsTable {
  id: Generated<number>;
  plant_id: number;
  date: Generated<number>;
  used_fertilizer: Generated<number>;
  fertilizer_type_id: number | null;
}

export interface SubstrateComponentsTable {
  substrate_id: number;
  component_id: number;
  parts: number;
}

export interface Database {
  roles: RolesTable;
  users: UsersTable;
  species: SpeciesTable;
  fineness_levels: FinenessLevelsTable;
  components: ComponentsTable;
  substrates: SubstratesTable;
  plants: PlantsTable;
  images: ImagesTable;
  image_embeddings: ImageEmbeddingsTable;
  fertilizer_types: FertilizerTypesTable;
  watering_records: WateringRecordsTable;
  substrate_components: SubstrateComponentsTable;
}
