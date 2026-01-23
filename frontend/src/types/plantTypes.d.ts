interface BasePlant {
  name: string;
  species: string;
  isPublic?: boolean;
}

interface Plant extends BasePlant {
  id: number;
  userId: number;
  description: string;
  created_at: string;
  imageUrl?: string;
  substrate: Substrate;
  images: Image[];
  isPublic: boolean;
}

interface AddPlant extends BasePlant {
  substrateId: number;
  image?: File;
}

interface EditPlant extends Partial<BasePlant> {
  substrateId?: number;
}

interface APIPlant {
  plant_id: number;
  plant_user_id: number;
  plant_name: string;
  plant_species: string;
  plant_description?: string;
  is_public: number;
  plant_created_at: string;
  image_url: string;
  substrate: APISubstrate;
  images: APIImage[];
}
