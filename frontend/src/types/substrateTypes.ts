interface Substrate {
  id: number;
  name: string;
  isPublic: boolean;
  imageUrl?: string;
  components: SubstrateComponent[];
}

interface SubstrateComponent extends Component {
  parts: number
}

interface AddSubstrate {
  name: string;
  isPublic?: boolean;
  image?: File;
}

interface AddSubstrateComponents {
  substrateId: number;
  components: {
    componentId: number;
    parts: number;
  }[];
}

interface EditSubstrate extends AddSubstrate {
  components?: EditSubstrateComponent[];
}

interface EditSubstrateComponent {
  componentId: number;
  parts: number;
}
