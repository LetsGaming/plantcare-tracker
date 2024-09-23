import SubstrateMapper from "./SubstrateMapping";

export default class PlantMapper {
  // Helper function to map a single plant
  static mapPlant(plant: any): Plant {
    return {
      id: plant.plant_id,
      name: plant.plant_name,
      species: plant.plant_species,
      isPublic: plant.is_public,
      created_at: plant.plant_created_at,
      substrate: SubstrateMapper.mapSubstrate(plant.substrate),
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
