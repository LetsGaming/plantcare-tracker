export default class ComponentMapper {
  // Helper function to map components
  static mapComponent(component: any): Component {
    return {
      id: component.component_id,
      name: component.component_name,
      description: component.component_description || component.component_fineness,
      imageUrl: component.image_url,
      parts: component.parts,
      fineness: component.component_fineness,
    };
  }

  static mapSubstrateComponent(component: any): SubstrateComponent {
    const mappedComponent = ComponentMapper.mapComponent(component);
    return {
      ...mappedComponent,
      parts: component.parts,
    };
  }

  // Convert API response to Substrate array
  static convertToComponents(response: any): Component[] {
    if (Array.isArray(response)) {
      return response.map(this.mapComponent);
    } else {
      return [this.mapComponent(response)];
    }
  }

  static convertToSubstrateComponents(response: any): SubstrateComponent[] {
    if (Array.isArray(response)) {
      return response.map(this.mapSubstrateComponent);
    } else {
      return [this.mapSubstrateComponent(response)];
    }
  }
}
