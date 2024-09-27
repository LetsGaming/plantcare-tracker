import ComponentMapper from "./ComponentMapping";

export default class SubstrateMapper {
  // Helper function to map substrate
  static mapSubstrate(substrate: any): Substrate {
    return {
      id: substrate.substrate_id,
      name: substrate.substrate_name,
      imageUrl: substrate.substrate_image_url,
      components: substrate.components.map(ComponentMapper.mapSubstrateComponent),
    };
  }

  // Convert API response to Substrate array
  static convertToSubstrates(response: any): Substrate[] {
    if (Array.isArray(response)) {
      return response.map(this.mapSubstrate);
    } else {
      return [this.mapSubstrate(response)];
    }
  }
}
