interface WateringRecord {
  id: number;
  plantId: number;
  date: string;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface AddWateringRecord {
  date: Date;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface EditWateringRecord {
  date?: string;
  usedFertilizer?: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  watering_date: string;
  used_fertilizer: boolean;
  fertilizer_type: "organic" | "synthetic" | null;
}
