/**
 * mapping/ComponentMapping.ts
 *
 * Maps V2 API component shapes to frontend models.
 *
 * V2 source type (ComponentData):
 *   component_id, component_name, fineness_id, component_fineness,
 *   image_url (string|null), images[]
 *
 * V2 SubstrateComponent source (ComponentRef):
 *   component_id, component_name, component_fineness, component_parts
 *   (no component_description — fineness name is used as description)
 */
export default class ComponentMapper {
  /**
   * Maps a single V2 APIComponent to the frontend Component model.
   */
  static mapComponent(component: APIComponent): Component {
    return {
      id: component.component_id,
      name: component.component_name,
      finenessId: component.fineness_id,
      fineness: component.component_fineness,
      imageUrl: component.image_url ?? undefined,
    };
  }

  /**
   * Maps a V2 APISubstrateComponent (lightweight ComponentRef) to the
   * frontend SubstrateComponent model.
   *
   * In V2, component_fineness serves as the description — there is no
   * separate component_description field.
   */
  static mapSubstrateComponent(component: APISubstrateComponent): SubstrateComponent {
    return {
      id: component.component_id,
      name: component.component_name,
      fineness: component.component_fineness,
      description: component.component_fineness,
      parts: component.component_parts,
    };
  }

  /**
   * Converts a V2 API response (single item or array) to Component[].
   */
  static convertToComponents(response: APIComponent | APIComponent[]): Component[] {
    return Array.isArray(response)
      ? response.map((c) => this.mapComponent(c))
      : [this.mapComponent(response)];
  }

  /**
   * Converts a V2 substrate components array to SubstrateComponent[].
   */
  static convertToSubstrateComponents(
    response: APISubstrateComponent | APISubstrateComponent[],
  ): SubstrateComponent[] {
    return Array.isArray(response)
      ? response.map((c) => this.mapSubstrateComponent(c))
      : [this.mapSubstrateComponent(response)];
  }
}