interface Plant {
    id: number;
    name: string;
    species: string;
    is_public: number;
    created_at: string;
    imageUrl?: string,
    substrate: Substrate;
}

interface Substrate {
    id: number;
    name: string;
    components: Component[];
}

interface Component {
    id: number;
    name: string;
    fineness: string;
    parts: number;
}

interface AddPlant {
    name: string,
    species: string,
    substrateId: number,
    isPublic?: boolean,
}