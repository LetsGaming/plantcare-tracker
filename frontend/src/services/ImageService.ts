import ApiUtils from "@/utils/apiUtils";

const BASE_ENDPOINT = "/images";

export default class ImageService {
  static async uploadImage(
    image: File,
    entityType: EntityType,
    entityId: number,
    date?: string | Date
  ) {
    const formData = new FormData();
    formData.append("image", image);
    if (date) {
      formData.append("date", date.toString());
    }

    const url = `/images/${entityType}/${entityId}`;
    const response = await ApiUtils.upload(url, formData);
    return response;
  }

  static async editImage(
    imageId: number,
    entityType: EntityType,
    date?: number,
    image?: File
  ) {
    const formData = new FormData();
    if (date) {
      formData.append("date", date.toString());
    }
    if (image) {
      formData.append("image", image);
    }
    const url = `${BASE_ENDPOINT}/image/${entityType}/${imageId}`;
    const response = await ApiUtils.patchImage(url, formData);
    return response;
  }

  static async deleteImage(imageId: number) {
    const url = `${BASE_ENDPOINT}/image/${imageId}`;
    const response = await ApiUtils.delete(url);
    return response;
  }

  static async deleteAllImages(entityType: EntityType, entityId: number) {
    const url = `${BASE_ENDPOINT}/${entityType}/${entityId}`;
    const response = await ApiUtils.delete(url);
    return response;
  }
}
