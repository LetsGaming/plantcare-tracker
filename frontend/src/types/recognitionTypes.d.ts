interface WateringBatchEntry {
  plantId: number;
  usedFertilizer: boolean;
  fertilizerTypeId?: number | null;
}

interface RecognitionCandidate {
  plantId: number;
  score: number;
}

interface MatchResult {
  snapshotId: string;
  threshold: number;
  candidates: RecognitionCandidate[];
}

interface ConfirmSnapshot {
  plantId: number;
  usedFertilizer?: boolean;
  fertilizerTypeId?: number | null;
  keepPhoto?: boolean;
}

interface ConfirmResult {
  recordId: number;
  imageId: number | null;
}
