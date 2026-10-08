/** Mirrors the backend upload limits so bad files are rejected before the request. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png"] as const;
export const IMAGE_ACCEPT = "image/jpeg,image/png";

export type ImageProblem = "type" | "size";

export const checkImageFile = (file: { type: string; size: number }): ImageProblem | null => {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
