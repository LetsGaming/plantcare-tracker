export default class SubstrateMapper {
  // Helper function to map components
  static mapComponent(component: any): Component {
    return {
      id: component.component_id,
      name: component.component_name,
      fineness: component.component_fineness,
      parts: component.parts,
    };
  }

  // Helper function to map substrate
  static mapSubstrate(substrate: any): Substrate {
    return {
      id: substrate.substrate_id,
      name: substrate.substrate_name,
      imageUrl: substrate.image_url,
      components: substrate.components.map(SubstrateMapper.mapComponent),
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
