/** A string that changes whenever the user-editable content of a form object changes. */
export const formSnapshot = (data: Record<string, unknown> | null | undefined): string => {
  if (!data) return "";
  return JSON.stringify(
    Object.keys(data)
      .sort()
      .map((key) => {
        const value = data[key];
        if (typeof File !== "undefined" && value instanceof File) {
          return [key, "file", value.name, value.size, value.lastModified];
        }
        return [key, value ?? null];
      }),
  );
};

/** Open-redirect safe target for post-login navigation; null when the path is not an in-app path. */
export const safeRedirectPath = (value: unknown): string | null => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  return raw;
};

/** True when a form value counts as filled in; 0 and false are real answers. */
export const hasFormValue = (value: unknown): boolean => {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  return true;
};
