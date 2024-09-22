import ApiUtils from "@/utils/apiUtils";
import ToastService from "./ToastService";
import storageService from "./StorageService";

const BASE_ENDPOINT = "/plants";
const CACHE_KEY_PUBLIC_PLANTS = 'public_plants_data';
const CACHE_KEY_PRIVATE_PLANTS = 'private_plants_data';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

const getEndpoint = (isPublic: boolean) => {
  return isPublic ? `${BASE_ENDPOINT}/public` : `${BASE_ENDPOINT}/private`;
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

// Convert API response to Plant array
function convertToPlants(response: any): Plant[] {
  if (Array.isArray(response)) {
    return response.map(mapPlant);
  } else {
    return [mapPlant(response)];
  }
}

// Check if cached data is expired
function isCacheExpired(timestamp: number): boolean {
  return Date.now() - timestamp > CACHE_EXPIRY_MS;
}

export default class PlantService {
  static async getPlants(isPublic: boolean, forceUpdate: boolean = false): Promise<Plant[]> {
    const cacheKey = isPublic ? CACHE_KEY_PUBLIC_PLANTS : CACHE_KEY_PRIVATE_PLANTS;

    // Try to get the cached data
    const cachedData = await storageService.get<{ plants: Plant[], timestamp: number }>(cacheKey);

    // If not forcing update, check if cached data exists and is not expired
    if (!forceUpdate && cachedData && !isCacheExpired(cachedData.timestamp)) {
      return cachedData.plants;
    }

    // Otherwise, fetch new data from the API
    try {
      const response = await ApiUtils.get(getEndpoint(isPublic));
      const plants = convertToPlants(response);

      // Store the plants and current timestamp in storage
      await storageService.set(cacheKey, { plants, timestamp: Date.now() });

      return plants;
    } catch (error) {
      ToastService.showError(`Error fetching plants: ${error}`);
      throw error;
    }
  }

  static async getPlantById(plantId: number, isPublic: boolean, forceUpdate: boolean = false): Promise<Plant> {
    const cacheKey = isPublic ? CACHE_KEY_PUBLIC_PLANTS : CACHE_KEY_PRIVATE_PLANTS;

    // Retrieve cached plants
    const cachedData = await storageService.get<{ plants: Plant[], timestamp: number }>(cacheKey);

    // Check if cached data exists and is not expired
    if (cachedData && !isCacheExpired(cachedData.timestamp)) {
      const plant = cachedData.plants.find(p => p.id === plantId);
      if (plant) {
        return plant; // Return the cached plant if found
      }
    }

    // Otherwise, fetch the plant from the API
    try {
      const response = await ApiUtils.get(`${getEndpoint(isPublic)}/${plantId}`);
      const plant = convertToPlants(response)[0];

      // Fetch all plants again to update the cache
      await this.getPlants(isPublic, true); // Refresh the cache

      return plant;
    } catch (error) {
      ToastService.showError(`Error fetching plant details: ${error}`);
      throw error;
    }
  }

  static async addPlant(plantToAdd: AddPlant): Promise<any> {
    try {
      const response = await ApiUtils.post(BASE_ENDPOINT, plantToAdd);

      // Invalidate the cached plants after adding a new plant
      await storageService.remove(CACHE_KEY_PUBLIC_PLANTS);
      await storageService.remove(CACHE_KEY_PRIVATE_PLANTS);

      return response; // Assuming response contains the inserted plant ID
    } catch (error) {
      ToastService.showError(`Error adding plant: ${error}`);
      throw error;
    }
  }
}
