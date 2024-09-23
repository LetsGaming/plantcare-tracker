interface Substrate {
    id: number;
    name: string;
    imageUrl: string;
    components: Component[];
}

interface Component {
    id: number;
    name: string;
    fineness: string;
    parts: number;
}