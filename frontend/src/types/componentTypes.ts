interface Component {
  id: number;
  name: string;
  fineness: string;
  imageUrl?: string;
}

interface SubstrateComponent extends Component {
  description: string;
  parts: number;
}

interface AddComponent extends Omit<Component, "fineness"> {
  fineness: number;
  image?: File;
}

interface EditComponent {
  name?: string;
  fineness?: number;
}

interface APIComponent {
  // TODO
}
