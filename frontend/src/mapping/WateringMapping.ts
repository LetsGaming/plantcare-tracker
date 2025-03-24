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
      fertilizerType: watering.fertilizer_type == null ? "Unbekannt" : watering.fertilizer_type === "organic" ? "Organisch" : "Mineralisch",
    };
  }

  // Convert API response to an array of WateringRecords
  static convertToWateringRecords(response: any): WateringRecord[] {
    if (Array.isArray(response)) {
      return response.map(this.mapWateringRecord);
    } else {
      return [this.mapWateringRecord(response)];
    }
  }
}
