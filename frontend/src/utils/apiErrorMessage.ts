/** The parts of an ApiError this module relies on; matched by name so the transport stays unimported. */
export interface ApiErrorLike extends Error {
  status: number;
  fields?: Record<string, string>;
}

export const asApiError = (error: unknown): ApiErrorLike | null => {
  const candidate = error as Partial<ApiErrorLike> | null;
  return candidate?.name === "ApiError" && typeof candidate.status === "number"
    ? (candidate as ApiErrorLike)
    : null;
};

/**
 * Human-readable text for a rejected request the user can act on (validation
 * and conflict answers), or null when the failure is not user-correctable.
 * Per-field problems are listed one per line.
 */
export const describeUserFixableError = (error: unknown): string | null => {
  const apiError = asApiError(error);
  if (!apiError) return null;
  if (apiError.status !== 400 && apiError.status !== 409) return null;

  const problems = apiError.fields ? Object.values(apiError.fields) : [];
  if (problems.length > 0) return problems.map((p) => `• ${p}`).join("\n");
  return apiError.message || null;
};

/** Per-field validation problems of a rejected request, keyed by the server's field names. */
export const fieldErrorsFrom = (error: unknown): Record<string, string> => {
  const apiError = asApiError(error);
  if (!apiError) return {};
  if (apiError.status !== 400 && apiError.status !== 409) return {};
  return { ...(apiError.fields ?? {}) };
};
