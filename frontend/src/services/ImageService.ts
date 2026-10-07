import ApiUtils from "@/utils/apiUtils";
import { handleRequest } from "@/utils/requestFeedback";

const BASE_ENDPOINT = "/images";
const RESOURCE_KEY = "image.title"; // Localization key for "Image"

const ImageService = {
  async uploadImage(image: File, entityType: EntityType, entityId: number, date?: string | Date) {
    const formData = new FormData();
    formData.append("image", image);
    if (date) {
      formData.append("date", date.toString());
    }

    const url = `${BASE_ENDPOINT}/${entityType}/${entityId}`;

    // handleRequest ensures the user gets a toast if the upload fails
    return handleRequest(ApiUtils.upload(url, formData), RESOURCE_KEY, "image.upload");
  },

  async editImage(imageId: number, date?: number, image?: File) {
    const formData = new FormData();
    if (date) formData.append("date", date.toString());
    if (image) formData.append("image", image);

    const url = `${BASE_ENDPOINT}/${imageId}`;

    return handleRequest(ApiUtils.patchFile(url, formData), RESOURCE_KEY, "error.action_failed");
  },

  async deleteImage(imageId: number) {
    const url = `${BASE_ENDPOINT}/${imageId}`;
    return handleRequest(ApiUtils.delete(url), RESOURCE_KEY, "error.action_failed");
  },

  async deleteAllImages(entityType: string, entityId: number) {
    const url = `${BASE_ENDPOINT}/${entityType}/${entityId}`;
    return handleRequest(ApiUtils.delete(url), RESOURCE_KEY, "error.action_failed");
  },
};

export default ImageService;
