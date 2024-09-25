interface Substrate {
  id: number;
  name: string;
  imageUrl?: string;
  components: Component[];
}

interface Component {
  id: number;
  name: string;
  fineness: string;
  parts: number;
}

interface AddSubstrate {
  name: string;
}

interface AddSubstrateComponents {
  substrateId: number;
  components: {
    componentId: number;
    parts: number;
  }[];
}

interface EditSubstrate {
  name: string;
  components: EditSubstrateComponent[];
}

interface EditSubstrateComponent {
  componentId: number;
  parts: number;
}
