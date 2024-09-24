import Utils from '@/utils/utils';
import SubstrateMapper from "./SubstrateMapping";
import ImageMapper from './ImageMapping';

export default class PlantMapper {
  // Helper function to map a single plant
  static mapPlant(plant: any): Plant {
    return {
      id: plant.plant_id,
      name: plant.plant_name,
      species: plant.plant_species,
      isPublic: plant.is_public,
      imageUrl: plant.image_url,
      created_at: Utils.convertDateString(plant.plant_created_at),
      substrate: SubstrateMapper.mapSubstrate(plant.substrate),
      images: ImageMapper.convertToImages(plant.images)
    };
  }

  // Convert API response to Plant array
  static convertToPlants(response: any): Plant[] {
    if (Array.isArray(response)) {
      return response.map(this.mapPlant);
    } else {
      return [this.mapPlant(response)];
    }
  }
}
