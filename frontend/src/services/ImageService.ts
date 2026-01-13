import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";

const BASE_ENDPOINT = "/images";
const RESOURCE_KEY = "image.title"; // Localization key for "Image"

export default class ImageService extends BaseService {
  
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

    const url = `${BASE_ENDPOINT}/${entityType}/${entityId}`;
    
    // handleRequest ensures the user gets a Toast if the upload fails
    return this.handleRequest(
      ApiUtils.upload(url, formData), 
      RESOURCE_KEY, 
      "image.upload"
    );
  }

  static async editImage(
    imageId: number,
    entityType: string,
    date?: number,
    image?: File
  ) {
    const formData = new FormData();
    if (date) formData.append("date", date.toString());
    if (image) formData.append("image", image);

    const url = `${BASE_ENDPOINT}/image/${entityType}/${imageId}`;
    
    return this.handleRequest(
      ApiUtils.patchImage(url, formData), 
      RESOURCE_KEY, 
      "error.action_failed"
    );
  }

  static async deleteImage(imageId: number) {
    const url = `${BASE_ENDPOINT}/image/${imageId}`;
    return this.handleRequest(
      ApiUtils.delete(url), 
      RESOURCE_KEY, 
      "error.action_failed"
    );
  }

  static async deleteAllImages(entityType: string, entityId: number) {
    const url = `${BASE_ENDPOINT}/${entityType}/${entityId}`;
    return this.handleRequest(
      ApiUtils.delete(url), 
      RESOURCE_KEY, 
      "error.action_failed"
    );
  }
}