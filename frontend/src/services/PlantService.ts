import ApiUtils from "@/utils/api";
import ToastService from "./ToastService";

const BASE_ENDPOINT = "/plants";

const getEndpoint = (isPublic: boolean) => {
  const endpoint = isPublic
    ? `${BASE_ENDPOINT}/public`
    : `${BASE_ENDPOINT}/private`;
  return endpoint;
};

// Helper function to map components
function mapComponent(component: any): Component {
  return {
    id: component.component_id,
    name: component.component_name,
    fineness: component.component_fineness,
    parts: component.parts,
  };
}

// Helper function to map substrate
function mapSubstrate(substrate: any): Substrate {
  return {
    id: substrate.substrate_id,
    name: substrate.substrate_name,
    components: substrate.components.map(mapComponent),
  };
}

// Helper function to map a single plant
function mapPlant(plant: any): Plant {
  return {
    id: plant.plant_id,
    name: plant.plant_name,
    species: plant.plant_species,
    is_public: plant.is_public,
    created_at: plant.plant_created_at,
    substrate: mapSubstrate(plant.substrate),
  };
}

// Main function to handle both single and multiple responses
function convertToPlants(response: any): Plant[] {
  if (Array.isArray(response)) {
    return response.map(mapPlant);
  } else {
    return [mapPlant(response)];
  }
}

export default class PlantService {
  static async getPlants(isPublic: boolean): Promise<Plant[]> {
    try {
      const response = await ApiUtils.get(getEndpoint(isPublic));
      return convertToPlants(response);
    } catch (error) {
      ToastService.showError(`Error fetching plants: ${error}`);
      throw error;
    }
  }

  static async getPlantById(plantId: number, isPublic: boolean) {
    try {
      const response = await ApiUtils.get(
        `${getEndpoint(isPublic)}/${plantId}`
      );
      return convertToPlants(response);
    } catch (error) {
        ToastService.showError(`Error fetching plant details: ${error}`, );
      throw error;
    }
  }
}
