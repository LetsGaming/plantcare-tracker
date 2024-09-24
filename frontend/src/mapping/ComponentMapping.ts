export default class ComponentMapper {
    // Helper function to map components
    static mapComponent(component: any): Component {
      return {
        id: component.component_id,
        name: component.component_name,
        fineness: component.component_fineness,
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
  }
  