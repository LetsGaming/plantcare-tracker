import localizationService from "@/services/general/LocalizationService";
import { compareText } from "@/utils/intlCache";
import { wateringStatus, type WateringTone } from "@/utils/wateringStats";

/** What a plant contributes to the round; it changes only when the plant itself changes. */
export interface RoundRow {
  readonly plantId: number;
  readonly name: string;
  /** Lower-cased name for the search filter. */
  readonly key: string;
  readonly image: ImageView | null;
  readonly tone: WateringTone;
  readonly rank: number;
  /** Ticked from the start: the plant is due, overdue or was never watered. */
  readonly preChecked: boolean;
}

/** A fertilizer chosen for one row; a row without an entry follows the round's fertilizer. */
export type FertilizerOverrides = ReadonlyMap<number, number | null>;

const TONE_BONUS: Record<WateringTone, number> = {
  overdue: 0.05,
  due: 0.03,
  new: 0.03,
  ok: 0,
};

/** Statuses come from the plant summaries; rows are sorted once, thirstiest first, then by name. */
export const buildRoundRows = (plants: readonly PlantView[], now = Date.now()): RoundRow[] => {
  const compare = compareText(localizationService.getLocale());
  return plants
    .map((plant): RoundRow => {
      const status = wateringStatus(plant.watering, now);
      return {
        plantId: plant.id,
        name: plant.name,
        key: plant.name.toLowerCase(),
        image: plant.cover ?? plant.images?.at(-1) ?? null,
        tone: status.tone,
        rank: status.rank,
        preChecked: status.tone !== "ok",
      };
    })
    .sort((a, b) => a.rank - b.rank || compare(a.name, b.name));
};

/** The ids ticked when nothing was touched yet, with `touched` taking precedence per plant. */
export const resolveChecked = (
  rows: readonly RoundRow[],
  touched: ReadonlyMap<number, boolean>,
): Set<number> => {
  const checked = new Set<number>();
  for (const row of rows) {
    if (touched.get(row.plantId) ?? row.preChecked) checked.add(row.plantId);
  }
  return checked;
};

export const buildBatchEntries = (
  rows: readonly RoundRow[],
  checked: ReadonlySet<number>,
  overrides: FertilizerOverrides,
  roundFertilizer: number | null,
): WateringBatchEntry[] =>
  rows
    .filter((row) => checked.has(row.plantId))
    .map((row) => {
      const fertilizer = overrides.has(row.plantId)
        ? (overrides.get(row.plantId) ?? null)
        : roundFertilizer;
      return {
        plantId: row.plantId,
        usedFertilizer: fertilizer !== null,
        fertilizerTypeId: fertilizer,
      };
    });

export const rerankCandidates = (
  candidates: RecognitionCandidate[],
  toneOf: (plantId: number) => WateringTone | undefined,
  limit = 3,
): RecognitionCandidate[] =>
  candidates
    .map((c) => ({ c, adjusted: c.score + TONE_BONUS[toneOf(c.plantId) ?? "ok"] }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, limit)
    .map(({ c }) => c);
