/**
 * mapping/WateringMapping.ts
 *
 * Maps V2 API watering shapes to frontend models.
 *
 */

export default class WateringMapper {
  static mapEntry(item: APIWateringItem): WateringEntry {
    return Object.freeze({
      id: item.id,
      plantId: item.plant_id,
      date: item.date,
      usedFertilizer: item.used_fertilizer,
      fertilizerTypeId: item.fertilizer_type_id ?? null,
    });
  }

  static mapEntries(items: readonly APIWateringItem[]): WateringEntry[] {
    return items.map((item) => WateringMapper.mapEntry(item));
  }

  static mapSummary(summary: APIWateringSummary): WateringSummary {
    return Object.freeze({
      lastWateredAt: summary.last_watered_at ?? null,
      lastFertilizedAt: summary.last_fertilized_at ?? null,
      avgIntervalDays: summary.avg_interval_days ?? null,
    });
  }

  /** Summaries keyed by numeric plant id; plants missing from the response stay missing. */
  static mapSummaries(
    summaries: APIWateringSummaries | null | undefined,
  ): Map<number, WateringSummary> {
    const byPlant = new Map<number, WateringSummary>();
    for (const [plantId, summary] of Object.entries(summaries ?? {})) {
      byPlant.set(Number(plantId), WateringMapper.mapSummary(summary));
    }
    return byPlant;
  }

  /**
   * Maps a V2 fertilizer type to the frontend FertilizerType model.
   */
  static mapFertilizerType(fertilizer: APIFertilizerType): FertilizerType {
    return {
      id: fertilizer.fertilizer_id,
      name: fertilizer.fertilizer_name,
    };
  }

  /**
   * Converts a V2 API response (single item or array) to FertilizerType[].
   */
  static convertToFertilizerTypes(
    response: APIFertilizerType | APIFertilizerType[],
  ): FertilizerType[] {
    return Array.isArray(response)
      ? response.map((f) => this.mapFertilizerType(f))
      : [this.mapFertilizerType(response)];
  }
}
