/**
 * mapping/ComponentMapping.ts
 *
 * Maps the component API shapes to frozen view models.
 *
 * Lists (GET /components, envelope): APIComponentListItem with id, name,
 * fineness_id, fineness_name and cover. Details add images.
 * Components embedded in a substrate (APISubstrateComponent: component_id,
 * component_name, component_fineness, component_parts) carry no fineness id;
 * the fineness name doubles as the description.
 */
import { toCoverView, toImageViews } from "./ImageMapping";

const toComponentView = (
  component: APIComponentListItem,
  images?: readonly APIImageDTO[],
): ComponentView =>
  Object.freeze({
    id: component.id,
    name: component.name,
    finenessId: component.fineness_id,
    fineness: component.fineness_name,
    cover: toCoverView(component.cover),
    searchText: ComponentMapper.searchTextOf(component.name, component.fineness_name),
    ...(images ? { images: toImageViews(images) } : {}),
  });

export default class ComponentMapper {
  /** What a component search matches: name and fineness; a newline keeps a match from spanning both. */
  static searchTextOf(name: string, fineness: string): string {
    return `${name}\n${fineness}`.toLowerCase();
  }

  static mapListItem(component: APIComponentListItem): ComponentView {
    return toComponentView(component);
  }

  static mapDetail(component: APIComponentDetail): ComponentView {
    return toComponentView(component, component.images ?? []);
  }

  /** A component embedded in a substrate: no fineness id, no cover. */
  static mapSubstratePart(component: APISubstrateComponent): SubstrateComponentView {
    return Object.freeze({
      id: component.component_id,
      name: component.component_name,
      finenessId: null,
      fineness: component.component_fineness,
      cover: null,
      parts: component.component_parts,
      searchText: ComponentMapper.searchTextOf(
        component.component_name,
        component.component_fineness,
      ),
    });
  }
}
