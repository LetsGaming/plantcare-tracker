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
import ImageMapper from "./ImageMapping";
import Utils from "@/utils/utils";

export default class SubstrateMapper {
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
