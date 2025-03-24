interface WateringRecord {
  id: number;
  plantId: number;
  date: string;
  date_millis: number;
  usedFertilizer: boolean;
  fertilizerType?: "Organisch" | "Mineralisch" | "Unbekannt";
}

interface AddWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface EditWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerType: "organic" | "synthetic" | "none" | null;
}

interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  watering_date: string;
  used_fertilizer: boolean;
  fertilizer_type: "organic" | "synthetic" | null;
}
