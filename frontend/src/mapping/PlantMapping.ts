/**
 * mapping/PlantMapping.ts
 *
 * Maps the plant API shapes to frozen view models.
 *
 * Lists (GET /plants, envelope): APIPlantListItem with plant_id, plant_name,
 * user_id, is_public, created_at (epoch ms), species_name, substrate
 * (SubstrateRef or null), cover, image_count and watering (owner only).
 * Details (GET /plants/:id, POST/PATCH): APIPlantDetail adds images.
 *
 * The substrate is a lightweight reference; load the full substrate when needed.
 */
import { toCoverView, toImageViews } from "./ImageMapping";
import WateringMapper from "./WateringMapping";

const toPlantView = (plant: APIPlantListItem, images?: readonly APIImageDTO[]): PlantView => {
  const view: PlantView = {
    id: plant.plant_id,
    name: plant.plant_name,
    userId: plant.user_id,
    isPublic: plant.is_public,
    createdAt: plant.created_at,
    speciesName: plant.species_name ?? null,
    substrate: plant.substrate
      ? Object.freeze({ id: plant.substrate.substrate_id, name: plant.substrate.substrate_name })
      : null,
    cover: toCoverView(plant.cover),
    imageCount: plant.image_count ?? 0,
    watering: plant.watering ? WateringMapper.mapSummary(plant.watering) : null,
    searchText: PlantMapper.searchTextOf(plant.plant_name, plant.species_name),
    ...(images ? { images: toImageViews(images) } : {}),
  };
  return Object.freeze(view);
};

export default class PlantMapper {
  /** What a plant search matches: name and species; a newline keeps a match from spanning both. */
  static searchTextOf(name: string, speciesName: string | null): string {
    return (speciesName ? `${name}\n${speciesName}` : name).toLowerCase();
  }

  static mapListItem(plant: APIPlantListItem): PlantView {
    return toPlantView(plant);
  }

  static mapDetail(plant: APIPlantDetail): PlantView {
    return toPlantView(plant, plant.images ?? []);
  }

  /** The same plant with another watering summary (from a watering write response). */
  static withWatering(plant: PlantView, watering: WateringSummary | null): PlantView {
    return Object.freeze({ ...plant, watering });
  }
}
