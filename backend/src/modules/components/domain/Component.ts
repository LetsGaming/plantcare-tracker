/**
 * modules/components/domain/Component.ts
 */

export interface ComponentData {
  component_id: number;
  component_name: string;
  fineness_id: number;
  component_fineness: string;
  image_url: string | null;
  images: { id: number; url: string; date: number }[]; // date = Unix epoch seconds
}

export interface FinenessLevel {
  fineness_id: number;
  fineness_name: string;
}

export interface ComponentRepository {
  findAll(): Promise<ComponentData[]>;
  findById(id: number): Promise<ComponentData | null>;
  findFinenessLevels(): Promise<FinenessLevel[]>;
  create(name: string, finenessId: number): Promise<number>;
  update(
    id: number,
    fields: { name?: string; fineness?: number },
  ): Promise<boolean>;
  delete(id: number): Promise<boolean>;
}
