import Utils from "@/utils/utils";

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
