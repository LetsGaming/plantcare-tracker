interface WateringRecord {
  id: number;
  plantId: number;
  date: string;
  date_millis: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number;
  fertilizerType?: "Organisch" | "Mineralisch" | "Unbekannt";
}

interface AddWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number; 
}

interface EditWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number;
}

interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  watering_date: string;
  used_fertilizer: boolean;
  fertilizer_type_id?: number;
  fertilizer_type: "organic" | "synthetic" | null;
}

interface FertilizerType {
  id: number;
  name: string;
}

interface APIFertilizerType {
  fertilizer_id: number;
  fertilizer_name: string;
}