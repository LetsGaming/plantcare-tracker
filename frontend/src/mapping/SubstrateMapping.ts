import ComponentMapper from "./ComponentMapping";

export default class SubstrateMapper {
  // Helper function to map substrate
  static mapSubstrate(substrate: APISubstrate): Substrate {
    return {
      id: substrate.substrate_id,
      userId: substrate.substrate_user_id,
      name: substrate.substrate_name,
      isPublic: !!substrate.is_public,
      imageUrl: substrate.image_url,
      components: ComponentMapper.convertToSubstrateComponents(
        substrate.components
      ),
    };
  }

  // Convert API response to Substrate array
  static convertToSubstrates(response: APISubstrate | APISubstrate[]): Substrate[] {
    if (Array.isArray(response)) {
      return response.map(this.mapSubstrate);
    } else {
      return [this.mapSubstrate(response)];
    }
  }
}
