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
  date: number; // Unix epoch seconds
}

export interface SubstrateData {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: boolean;
  substrate_created_at: number;
  image_url: string | null;
  images: ImageRef[];
  components: ComponentRef[];
}

/** Public substrates are visible to everyone, private ones only to their owner. */
export const isSubstrateVisibleTo = (substrate: SubstrateData, userId: number | null): boolean =>
  substrate.is_public || (userId !== null && substrate.substrate_user_id === userId);

export interface SubstrateRepository {
  findAllPublic(): Promise<SubstrateData[]>;
  findAllByUser(userId: number): Promise<SubstrateData[]>;
  findById(id: number): Promise<SubstrateData | null>;
  create(name: string, userId: number, isPublic: boolean): Promise<number>;
  update(
    id: number,
    userId: number,
    fields: { name?: string; isPublic?: boolean },
  ): Promise<boolean>;
  addComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void>;
  upsertComponents(
    substrateId: number,
    components: { componentId: number; parts: number }[],
  ): Promise<void>;
  deleteComponents(substrateId: number, componentIds: number[]): Promise<void>;
  delete(id: number, userId: number): Promise<boolean>;
}
