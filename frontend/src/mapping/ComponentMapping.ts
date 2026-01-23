export default class ComponentMapper {
  // Helper function to map components
  static mapComponent(component: APIComponent): Component {
    return {
      id: component.component_id,
      name: component.component_name,
      fineness: component.component_fineness,
      imageUrl: component.image_url,
    };
  }

  static mapSubstrateComponent(
    component: APISubstrateComponent,
  ): SubstrateComponent {
    const mappedComponent = ComponentMapper.mapComponent(component);
    return {
      ...mappedComponent,
      description:
        component.component_description || component.component_fineness,
      parts: component.component_parts,
    };
  }

  // Convert API response to Substrate array
  static convertToComponents(
    response: APIComponent | APIComponent[],
  ): Component[] {
    if (Array.isArray(response)) {
      return response.map(this.mapComponent);
    } else {
      return [this.mapComponent(response)];
    }
  }

  static convertToSubstrateComponents(
    response: APISubstrateComponent | APISubstrateComponent[],
  ): SubstrateComponent[] {
    if (Array.isArray(response)) {
      return response.map(this.mapSubstrateComponent);
    } else {
      return [this.mapSubstrateComponent(response)];
    }
  }
}
