import Utils from "@/utils/utils";

export default class ImageMapper {
  // Helper function to map substrate
  static mapImage(image: any): Image {
    return {
        id: image.id,
        url: image.url,
        date: Utils.convertDateString(image.date)
    }
  }

  // Convert API response to Substrate array
  static convertToImages(response: any): Image[] {
    if (Array.isArray(response)) {
      return response.map(this.mapImage);
    } else {
      return [this.mapImage(response)];
    }
  }
}
