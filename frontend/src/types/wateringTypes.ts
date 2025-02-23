interface WateringRecord {
  id: number;
  plantId: number;
  date: string;
  amount: number;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface AddWateringRecord {
  plantId: number;
  date: string;
  amount: number;
  usedFertilizer: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface EditWateringRecord {
  date?: string;
  amount?: number;
  usedFertilizer?: boolean;
  fertilizerType?: "organic" | "synthetic" | null;
}

interface APIWateringRecord {
  record_id: number;
  plant_id: number;
  record_date: string;
  amount: number;
  used_fertilizer: boolean;
  fertilizer_type: "organic" | "synthetic" | null;
}
