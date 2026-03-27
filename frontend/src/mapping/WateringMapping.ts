/**
 * mapping/WateringMapping.ts
 *
 * Maps V2 API watering shapes to frontend models.
 *
 * V2 source types:
 *   - APIWateringRecord: record_id, plant_id, plant_name, owner_id,
 *                        watering_date, used_fertilizer,
 *                        fertilizer_type_id (int|null), fertilizer_type (string|null)
 *   - APIFertilizerType: fertilizer_id, fertilizer_name
 */
import Utils from "@/utils/utils";

export default class WateringMapper {
  /**
   * Maps a single V2 watering record to the frontend WateringRecord model.
   *
   * plant_name is included in V2 API responses, removing the need for
   * additional plant lookups when rendering the calendar view.
   */
  static mapWateringRecord(watering: APIWateringRecord): WateringRecord {
    return {
      id: watering.record_id,
      plantId: watering.plant_id,
      plantName: watering.plant_name,
      date: Utils.convertDateMillis(watering.watering_date),
      date_millis: Utils.convertToMillis(watering.watering_date),
      usedFertilizer: watering.used_fertilizer,
      fertilizerTypeId: watering.fertilizer_type_id ?? undefined,
      fertilizerType: watering.fertilizer_type ?? undefined,
    };
  }

  /**
   * Converts a V2 API response (single item or array) to WateringRecord[].
   */
  static convertToWateringRecords(
    response: APIWateringRecord | APIWateringRecord[],
  ): WateringRecord[] {
    return Array.isArray(response)
      ? response.map((w) => this.mapWateringRecord(w))
      : [this.mapWateringRecord(response)];
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
