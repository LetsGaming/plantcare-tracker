/**
 * modules/substrate/domain/Substrate.ts
 */

export interface ComponentRef {
  component_id: number;
  component_name: string;
  component_fineness: string;
  component_parts: number;
}

export interface ImageRef {
  id: number;
  url: string;
  date: string;
}

export interface SubstrateData {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: boolean;
  substrate_created_at: string;
  image_url: string | null;
  images: ImageRef[];
  components: ComponentRef[];
}

export interface SubstrateRepository {
  findAllPublic(): Promise<SubstrateData[]>;
  findAllByUser(userId: number): Promise<SubstrateData[]>;
  findById(id: number, includeImages?: boolean): Promise<SubstrateData | null>;
  create(name: string, userId: number, isPublic: boolean): Promise<number>;
  update(id: number, userId: number, fields: { name?: string; isPublic?: boolean }): Promise<boolean>;
  addComponents(substrateId: number, components: { componentId: number; parts: number }[]): Promise<void>;
  upsertComponents(substrateId: number, components: { componentId: number; parts: number }[]): Promise<void>;
  deleteComponents(substrateId: number, componentIds: number[]): Promise<void>;
  delete(id: number, userId: number): Promise<boolean>;
}
