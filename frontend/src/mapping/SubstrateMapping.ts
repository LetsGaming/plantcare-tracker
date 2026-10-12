/**
 * mapping/SubstrateMapping.ts
 *
 * Maps V2 API substrate shapes to frontend models.
 *
 * V2 source type (SubstrateData):
 *   substrate_id, substrate_user_id, substrate_name,
 *   is_public (boolean), substrate_created_at,
 *   image_url (string|null), images[], components[]
 */
import ComponentMapper from "./ComponentMapping";
import ImageMapper, { toCoverView, toImageViews } from "./ImageMapping";
import Utils from "@/utils/utils";

const isDetail = (
  substrate: APISubstrateListItem | APISubstrateDetail,
): substrate is APISubstrateDetail => "substrate_id" in substrate;

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

  static mapListItems(substrates: readonly APISubstrateListItem[]): SubstrateView[] {
    return substrates.map((substrate) => SubstrateMapper.mapListItem(substrate));
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

  /** Either API shape (list item or detail) to the one SubstrateView. */
  static toView(substrate: APISubstrateListItem | APISubstrateDetail): SubstrateView {
    return isDetail(substrate)
      ? SubstrateMapper.mapDetail(substrate)
      : SubstrateMapper.mapListItem(substrate);
  }

  /**
   * Maps a single V2 APISubstrate to the frontend Substrate model.
   */
  static mapSubstrate(substrate: APISubstrate): Substrate {
    return {
      id: substrate.substrate_id,
      userId: substrate.substrate_user_id,
      name: substrate.substrate_name,
      isPublic: substrate.is_public,
      created_at: Utils.convertDateMillis(substrate.substrate_created_at),
      imageUrl: substrate.image_url ?? undefined,
      images: ImageMapper.convertToImages(substrate.images ?? []),
      components: ComponentMapper.convertToSubstrateComponents(substrate.components ?? []),
    };
  }

  /**
   * Converts a V2 API response (single item or array) to Substrate[].
   */
  static convertToSubstrates(response: APISubstrate | APISubstrate[]): Substrate[] {
    return Array.isArray(response)
      ? response.map((s) => this.mapSubstrate(s))
      : [this.mapSubstrate(response)];
  }
}
