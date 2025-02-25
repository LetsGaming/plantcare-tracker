interface Component {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  parts: number;
  fineness: string;
}

interface AddComponent {
  name: string;
  fineness: string;
  image?: File;
}

interface EditComponent {
  name?: string;
  fineness?: string;
}