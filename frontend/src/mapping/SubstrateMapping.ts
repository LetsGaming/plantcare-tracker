/**
 * mapping/SubstrateMapping.ts
 *
 * Maps the substrate API shapes to frozen view models.
 *
 * Lists (GET /substrates, envelope): APISubstrateListItem with id, name,
 * user_id, is_public, created_at (epoch ms), cover and component_count; the
 * mix itself (`components`) is null on list items.
 * Details (GET /substrates/:id, POST/PATCH): APISubstrateDetail with the
 * legacy substrate_* field names, images and components.
 */
import ComponentMapper from "./ComponentMapping";
import { toCoverView, toImageViews } from "./ImageMapping";

export default class SubstrateMapper {
  static searchTextOf(name: string): string {
    return name.toLowerCase();
  }

  static mapListItem(substrate: APISubstrateListItem): SubstrateView {
    return Object.freeze({
      id: substrate.id,
      name: substrate.name,
      userId: substrate.user_id,
      isPublic: substrate.is_public,
      createdAt: substrate.created_at,
      cover: toCoverView(substrate.cover),
      componentCount: substrate.component_count ?? 0,
      components: null,
      searchText: SubstrateMapper.searchTextOf(substrate.name),
    });
  }

  static mapDetail(substrate: APISubstrateDetail): SubstrateView {
    const components = Object.freeze(
      (substrate.components ?? []).map((component) => ComponentMapper.mapSubstratePart(component)),
    );
    return Object.freeze({
      id: substrate.substrate_id,
      name: substrate.substrate_name,
      userId: substrate.substrate_user_id,
      isPublic: substrate.is_public,
      createdAt: substrate.substrate_created_at,
      cover: toCoverView(substrate.cover),
      componentCount: components.length,
      components,
      images: toImageViews(substrate.images),
      searchText: SubstrateMapper.searchTextOf(substrate.substrate_name),
    });
  }
}
