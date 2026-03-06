/**
 * modules/components/domain/Component.ts
 */

export interface ComponentData {
  component_id: number;
  component_name: string;
  fineness_id: number;
  component_fineness: string;
  image_url: string | null;
  images: { id: number; url: string; date: string }[];
}

export interface FinenessLevel {
  fineness_id: number;
  fineness_name: string;
}
