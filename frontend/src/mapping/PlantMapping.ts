/**
 * mapping/PlantMapping.ts
 *
 * Maps V2 API plant shapes to frontend models.
 *
 * V2 source type (PlantData):
 *   plant_id, plant_user_id, plant_name, plant_species,
 *   is_public (boolean), plant_created_at,
 *   image_url (string|null), substrate (SubstrateRef|null), images[]
 *
 * Important V2 differences from V1:
 *   - substrate is a lightweight SubstrateRef { substrate_id, substrate_name },
 *     NOT the full SubstrateData object. Use SubstrateService.getSubstrateById()
 *     to load full substrate details when needed.
 *   - plant_description does not exist in V2.
 *   - is_public is always boolean (the repo normalizes the MySQL tinyint).
 */
import ImageMapper from "./ImageMapping";
import Utils from "@/utils/utils";

export default class PlantMapper {
  /**
   * Maps a single V2 APIPlant to the frontend Plant model.
   *
   * Species is used as the description fallback since V2 does not
   * include a separate plant_description field.
   */
  static mapPlant(plant: APIPlant): Plant {
    return {
      id: plant.plant_id,
      userId: plant.plant_user_id,
      name: plant.plant_name,
      species: plant.plant_species,
      description: plant.plant_species,
      isPublic: plant.is_public,
      created_at: Utils.convertDateString(plant.plant_created_at),
      imageUrl: plant.image_url ?? undefined,
      substrate: plant.substrate
        ? { id: plant.substrate.substrate_id, name: plant.substrate.substrate_name }
        : null,
      images: ImageMapper.convertToImages(plant.images ?? []),
    };
  }

  /**
   * Converts a V2 API response (single item or array) to Plant[].
   */
  static convertToPlants(response: APIPlant | APIPlant[]): Plant[] {
    return Array.isArray(response)
      ? response.map((p) => this.mapPlant(p))
      : [this.mapPlant(response)];
  }
}
