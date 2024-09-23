interface Plant {
    id: number;
    name: string;
    species: string;
    is_public: number;
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