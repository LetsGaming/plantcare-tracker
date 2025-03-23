interface WateringRecord {
  id: number;
  plantId: number;
  date: string;
  usedFertilizer: boolean;
  fertilizerType?: "Organisch" | "Mineralisch" | "Unbekannt";
}

interface AddWateringRecord {
  date?: number;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface EditWateringRecord {
  date?: number | string;
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
