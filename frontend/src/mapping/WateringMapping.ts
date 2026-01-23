import Utils from "@/utils/utils";

export default class WateringMapper {
  // Helper function to map a single watering record
  static mapWateringRecord(watering: APIWateringRecord): WateringRecord {
    return {
      id: watering.record_id,
      plantId: watering.plant_id,
      date: Utils.convertDateString(watering.watering_date),
      date_millis: Utils.convertToMillis(watering.watering_date),
      usedFertilizer: watering.used_fertilizer,
      fertilizerTypeId: watering.fertilizer_type_id,
      fertilizerType:
        watering.fertilizer_type == null
          ? "Unbekannt"
          : watering.fertilizer_type === "organic"
          ? "Organisch"
          : "Mineralisch",
    };
  }

  // Convert API response to an array of WateringRecords
  static convertToWateringRecords(response: APIWateringRecord | APIWateringRecord[]): WateringRecord[] {
    if (Array.isArray(response)) {
      return response.map(this.mapWateringRecord);
    } else {
      return [this.mapWateringRecord(response)];
    }
  }

  static mapFertilizerType(fertilizer: APIFertilizerType): FertilizerType {
    return {
      id: fertilizer.fertilizer_id,
      name: fertilizer.fertilizer_name,
    };
  }

  static convertToFertilizerTypes(response: APIFertilizerType | APIFertilizerType[]): FertilizerType[] {
    if (Array.isArray(response)) {
      return response.map(this.mapFertilizerType);
    } else {
      return [this.mapFertilizerType(response)];
    }
  }
}
