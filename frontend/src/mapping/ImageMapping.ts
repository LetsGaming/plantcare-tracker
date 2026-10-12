import Utils from "@/utils/utils";

const MILLIS_PER_SECOND = 1000;

/** The API sends image dates in epoch seconds; the app works in milliseconds. */
export const toImageView = (image: APIImageDTO): ImageView =>
  Object.freeze({
    id: image.id,
    url: image.url,
    srcset: image.srcset ?? null,
    width: image.width ?? null,
    height: image.height ?? null,
    placeholder: image.placeholder ?? null,
    dateMs: image.date * MILLIS_PER_SECOND,
  });

export const toImageViews = (
  images: readonly APIImageDTO[] | null | undefined,
): readonly ImageView[] => Object.freeze((images ?? []).map((image) => toImageView(image)));

export const toCoverView = (image: APIImageDTO | null | undefined): ImageView | null =>
  image ? toImageView(image) : null;

export default class ImageMapper {
  // Helper function to map substrate
  static mapImage(image: APIImage): Image {
    return {
      id: image.id,
      url: image.url,
      date: Utils.convertDateMillis(image.date),
      date_millis: Utils.convertToMillis(image.date),
    };
  }

  // Convert API response to Substrate array
  static convertToImages(response: APIImage | APIImage[]): Image[] {
    if (Array.isArray(response)) {
      return response.map(this.mapImage);
    } else {
      return [this.mapImage(response)];
    }
  }
}
