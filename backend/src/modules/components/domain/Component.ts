/**
 * modules/components/domain/Component.ts
 */

import type { Page } from '../../../core/pagination';
import type { ImageDTO } from '../../images/domain/imageDto';

export interface ComponentListItem {
  id: number;
  name: string;
  fineness_id: number;
  fineness_name: string;
  cover: ImageDTO | null;
}

export interface ComponentDetail extends ComponentListItem {
  /** Oldest first. */
  images: ImageDTO[];
}

export interface FinenessLevel {
  fineness_id: number;
  fineness_name: string;
}

export interface ComponentPageQuery {
  limit: number;
  cursor: { v: string | number; id: string | number } | null;
  q: string | null;
}

export interface ComponentRepository {
  findPage(query: ComponentPageQuery, sort: string): Promise<Page<ComponentListItem>>;
  count(q: string | null): Promise<number>;
  findById(id: number): Promise<ComponentDetail | null>;
  findFinenessLevels(): Promise<FinenessLevel[]>;
  create(name: string, finenessId: number): Promise<number>;
  update(id: number, fields: { name?: string; fineness?: number }): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}
