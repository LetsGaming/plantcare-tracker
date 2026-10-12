/**
 * modules/substrate/domain/Substrate.ts
 */

import type { ImageDTO } from '../../images/domain/imageDto';
import type { Cursor } from '../../../core/pagination';

export interface ComponentRef {
  component_id: number;
  component_name: string;
  component_fineness: string;
  component_parts: number;
}

export interface ComponentInput {
  componentId: number;
  parts: number;
}

/** Detail shape of one substrate; lists use SubstrateListItem. */
export interface SubstrateData {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: boolean;
  substrate_created_at: number; // Unix epoch milliseconds
  /** Newest image, null when the substrate has none. */
  cover: ImageDTO | null;
  /** Oldest first. */
  images: ImageDTO[];
  components: ComponentRef[];
}

export interface SubstrateListItem {
  id: number;
  name: string;
  user_id: number;
  is_public: boolean;
  created_at: number; // Unix epoch milliseconds
  cover: ImageDTO | null;
  component_count: number;
}

export type SubstrateSort = 'created' | 'name';

export interface SubstrateListParams {
  limit: number;
  /** Decoded cursor of the requested sort, null for the first page. */
  cursor: Cursor | null;
  sort: SubstrateSort;
  q: string | null;
  /** Only substrates containing this component ("used in"). */
  componentId: number | null;
}

export interface SubstratePage {
  items: SubstrateListItem[];
  nextCursor: string | null;
  /** First page only. */
  total?: number;
}

export interface SubstrateUpdateFields {
  name?: string;
  isPublic?: boolean;
  /** Replaces the whole mix. */
  components?: ComponentInput[];
  removedComponents?: number[];
}

/** Public substrates are visible to everyone, private ones only to their owner. */
export const isSubstrateVisibleTo = (substrate: SubstrateData, userId: number | null): boolean =>
  substrate.is_public || (userId !== null && substrate.substrate_user_id === userId);

export interface SubstrateRepository {
  listMine(userId: number, params: SubstrateListParams): Promise<SubstratePage>;
  listPublic(params: SubstrateListParams): Promise<SubstratePage>;
  findById(id: number): Promise<SubstrateData | null>;
  /** With `components`, the substrate and its mix are written in one transaction. */
  create(
    name: string,
    userId: number,
    isPublic: boolean,
    components?: ComponentInput[],
  ): Promise<number>;
  /** One transaction; false (nothing written) when the substrate is not owned by `userId`. */
  update(id: number, userId: number, fields: SubstrateUpdateFields): Promise<boolean>;
  addComponents(substrateId: number, components: ComponentInput[]): Promise<void>;
  /** Replaces the whole mix atomically; false when the substrate is not owned by `userId`. */
  replaceComponents(
    substrateId: number,
    userId: number,
    components: ComponentInput[],
  ): Promise<boolean>;
  deleteComponents(substrateId: number, componentIds: number[]): Promise<void>;
  delete(id: number, userId: number): Promise<boolean>;
}
