import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

/** Names of errors the caller reports itself; no generic toast is shown for them. */
const SILENT_ERRORS = new Set(["RefreshError", "RegisterError"]);

/**
 * Awaits a request and, when it fails, shows a localized error toast before
 * rethrowing, so callers only deal with the success path.
 */
export const handleRequest = async <T>(
  request: Promise<T>,
  resourceNameKey: string,
  actionKey = "error.fetch_failed",
): Promise<T> => {
  try {
    return await request;
  } catch (error: any) {
    if (SILENT_ERRORS.has(error?.name)) throw error;
    ToastService.showError({
      key: actionKey,
      vars: {
        resource: localizationService.t(resourceNameKey),
        details: error?.message || String(error),
      },
      fallback: `Operation failed: ${error}`,
    });
    throw error;
  }
};
