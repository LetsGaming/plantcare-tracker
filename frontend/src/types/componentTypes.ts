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

interface AddComponent extends Component {
  image?: File;
}

interface EditComponent extends Component{
}