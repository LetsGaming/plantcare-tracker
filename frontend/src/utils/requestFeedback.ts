import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import { asApiError, describeUserFixableError } from "@/utils/apiErrorMessage";

/** Names of errors the caller reports itself; no generic toast is shown for them. */
const SILENT_ERRORS = new Set(["RefreshError", "RegisterError"]);

const GENERIC_ACTION_KEY = "error.action_failed";
const MISSING = "\u0000missing";
const UNRESOLVED_PLACEHOLDER = /\{\w+\}/;
const HTTP_UNAUTHORIZED = 401;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR = 500;

let quietDepth = 0;

/**
 * Runs `run` while failed requests show no toast, for screens that present the
 * failure inline themselves. The error is still thrown to the caller.
 */
export const withoutErrorToasts = async <T>(run: () => Promise<T>): Promise<T> => {
  quietDepth += 1;
  try {
    return await run();
  } finally {
    quietDepth -= 1;
  }
};

export type FailureKind =
  "network" | "rate-limit" | "server" | "unauthorized" | "fixable" | "other";

export const classifyFailure = (error: unknown): FailureKind => {
  const apiError = asApiError(error);
  if (apiError) {
    if (apiError.status === HTTP_TOO_MANY_REQUESTS) return "rate-limit";
    if (apiError.status >= HTTP_SERVER_ERROR) return "server";
    if (apiError.status === HTTP_UNAUTHORIZED) return "unauthorized";
    return describeUserFixableError(error) ? "fixable" : "other";
  }
  if (error instanceof TypeError) return "network";
  return "other";
};

/** A complete, localized sentence for a failed request; never contains a raw placeholder. */
export const describeRequestFailure = (
  error: unknown,
  resourceNameKey: string,
  actionKey = "error.fetch_failed",
): string => {
  const t = localizationService.t;
  switch (classifyFailure(error)) {
    case "fixable":
      return describeUserFixableError(error) as string;
    case "network":
      return t("toast2.network", undefined, "No connection. Check your network and try again.");
    case "rate-limit":
      return t("toast2.rate_limited", undefined, "Too many attempts. Please wait a moment.");
    case "server":
      return t("toast2.server", undefined, "The server had a problem. Please try again later.");
    default:
      break;
  }

  const vars = { resource: t(resourceNameKey) };
  if (actionKey !== GENERIC_ACTION_KEY) {
    const specific = t(actionKey, vars, MISSING);
    if (specific !== MISSING && !UNRESOLVED_PLACEHOLDER.test(specific)) return specific;
  }
  return t("toast2.action_failed", vars, `${vars.resource}: that did not work. Please try again.`);
};

export interface RequestFeedbackOptions {
  /** Offered as a Retry action on the failure toast. */
  retry?: () => void;
}

/** Shows the failure toast for an error the caller handled itself. */
export const showRequestFailure = (
  error: unknown,
  resourceNameKey: string,
  actionKey = "error.fetch_failed",
  options: RequestFeedbackOptions = {},
): void => {
  const retry = options.retry;
  ToastService.showError(
    describeRequestFailure(error, resourceNameKey, actionKey),
    undefined,
    undefined,
    undefined,
    retry
      ? { text: localizationService.t("toast.retry", undefined, "Retry"), handler: retry }
      : undefined,
  );
};

/**
 * Awaits a request and, when it fails, shows a localized error toast before
 * rethrowing, so callers only deal with the success path.
 */
export const handleRequest = async <T>(
  request: Promise<T>,
  resourceNameKey: string,
  actionKey = "error.fetch_failed",
  options: RequestFeedbackOptions = {},
): Promise<T> => {
  try {
    return await request;
  } catch (error: unknown) {
    const name = (error as { name?: string } | null)?.name ?? "";
    if (SILENT_ERRORS.has(name) || quietDepth > 0) throw error;
    showRequestFailure(error, resourceNameKey, actionKey, options);
    throw error;
  }
};
