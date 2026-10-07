import ApiUtils from "@/utils/apiUtils";

/**
 * Human-readable text for a rejected request the user can act on (validation
 * and conflict answers), or null when the failure is not user-correctable.
 * Per-field problems are listed one per line.
 */
export const describeUserFixableError = (error: unknown): string | null => {
  if (!ApiUtils.isApiError(error)) return null;
  if (error.status !== 400 && error.status !== 409) return null;

  const problems = error.fields ? Object.values(error.fields) : [];
  if (problems.length > 0) return problems.map((p) => `• ${p}`).join("\n");
  return error.message || null;
};
