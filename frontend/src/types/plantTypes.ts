interface Plant {
    id: number;
    name: string;
    species: string;
    is_public: number;
    created_at: string;
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