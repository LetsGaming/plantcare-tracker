interface Component {
  name: string;
  fineness: string;
}

interface SubstrateComponent extends Component {
  id: number;
  description: string;
  imageUrl: string;
  parts: number;
}

interface AddComponent extends Omit<Component, "fineness"> {
  fineness: number;
  image?: File;
}

interface EditComponent extends Component{
}

interface APIComponent {
  // TODO 
}