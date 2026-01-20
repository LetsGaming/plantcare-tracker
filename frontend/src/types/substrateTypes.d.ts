interface BaseSubstrate {
  name: string;
  isPublic?: boolean;
}

interface Substrate extends BaseSubstrate {
  id: number;
  userId: number;
  isPublic: boolean;
  imageUrl?: string;
  components: SubstrateComponent[];
}

interface AddSubstrate extends BaseSubstrate {
  image?: File;
}

interface BaseSubstrateComponent {
  componentId: number;
  parts: number;
}

interface AddSubstrateComponents {
  substrateId: number;
  components: BaseSubstrateComponent[];
}

interface EditSubstrateComponent extends BaseSubstrateComponent {}

interface EditSubstrate extends AddSubstrate {
}

interface APISubstrate {
  substrate_id: number;
  substrate_user_id: number;
  substrate_name: string;
  is_public: number;
  image_url: string;
  components: any[];
}