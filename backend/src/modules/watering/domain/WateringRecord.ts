/**
 * modules/watering/domain/WateringRecord.ts
 */

export interface WateringRecordData {
  record_id: number;
  plant_id: number;
  plant_name: string;
  watering_date: number; // Unix epoch seconds
  used_fertilizer: boolean;
  fertilizer_type_id: number | null;
  fertilizer_type: string | null;
  owner_id: number;
}

export interface FertilizerType {
  fertilizer_id: number;
  fertilizer_name: string;
}

export interface CreateWateringDTO {
  plantId: number;
  date: number; // Unix epoch seconds
  usedFertilizer: boolean;
  fertilizerTypeId: number | null;
}

export interface UpdateWateringDTO {
  date?: number | null; // Unix epoch seconds
  usedFertilizer?: boolean;
  fertilizerTypeId?: number | null;
}

export interface WateringRepository {
  findByPlant(plantId: number, userId: number): Promise<WateringRecordData[]>;
  findById(recordId: number, userId: number): Promise<WateringRecordData | null>;
  findFertilizerTypes(): Promise<FertilizerType[]>;
  create(dto: CreateWateringDTO, userId: number): Promise<number>;
  update(recordId: number, userId: number, dto: UpdateWateringDTO): Promise<boolean>;
  delete(recordId: number, userId: number): Promise<boolean>;
}
