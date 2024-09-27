interface Substrate {
  id: number;
  name: string;
  imageUrl?: string;
  components: SubstrateComponent[];
}

interface SubstrateComponent extends Component {
  parts: number
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
  name?: string;
  components?: EditSubstrateComponent[];
}

interface EditSubstrateComponent {
  componentId: number;
  parts: number;
}
