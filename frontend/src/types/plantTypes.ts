interface Plant {
    id: number;
    name: string;
    species: string;
    isPublic: boolean;
    created_at: string;
    imageUrl?: string,
    substrate: Substrate;
}

interface AddPlant {
    name: string,
    species: string,
    substrateId: number,
    isPublic?: boolean,
}

interface APIPlant {
    plant_id: number;
    plant_name: string;
    plant_species: string;
    is_public: boolean;
    plant_created_at: string;
    substrate: any;
  }