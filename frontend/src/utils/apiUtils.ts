import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import TokenUtils from "./tokenUtils";
import Utils from "./utils";
import UserService from "@/services/UserService";

/** Pre-computed API URL to eliminate repeated string concatenation logic */
const API_BASE_URL = Utils.getApiBaseUrl();

// ── V2 Response envelope ──────────────────────────────────────────────────────

/**
 * V2 success envelope: { success: true, data: T }
 */
interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

/**
 * V2 error envelope: { error: { type, message, statusCode, fields? } }
 */
interface ApiErrorBody {
  error?: {
    type?: string;
    message?: string;
    statusCode?: number;
    /** Present only on ValidationError (400) */
    fields?: Record<string, string>;
  };
  success?: false;
}

type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorBody;

// ── SSE types ─────────────────────────────────────────────────────────────────

/** Structure for individual Server-Sent Events (SSE) */
interface StreamEvent<T = any> {
  data: T;
  event?: string;
}

/** Callback definition for processing stream events */
type StreamCallback<T = any> = (event: StreamEvent<T>) => void;

// ── ApiError ──────────────────────────────────────────────────────────────────

/**
 * Custom Error class for API-level failures.
 * Extends the native Error to include HTTP status codes, the V2 error type,
 * and optional per-field validation details.
 */
class ApiError extends Error {
  /** V2 error type discriminator e.g. 'ValidationError', 'NotFoundError' */
  public readonly errorType?: string;
  /** Per-field validation errors from V2 ValidationError (400) responses */
  public readonly fields?: Record<string, string>;

  constructor(
    public status: number,
    public data: any,
    message?: string,
  ) {
    const errorObj = data?.error ?? null;
    const finalMessage =
      message || errorObj?.message || data?.message || "API error";

    super(finalMessage);
    this.name = "ApiError";
    this.errorType = errorObj?.type;
    this.fields = errorObj?.fields;

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, ApiError);
    }
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toString(): string {
    return `${this.name} (${this.status}): ${this.message}`;
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      errorType: this.errorType,
      message: this.message,
      fields: this.fields,
      data: this.data,
      stack: this.stack,
    };
  }
}

// ── Response handler ──────────────────────────────────────────────────────────

const NO_REFRESH_ENDPOINTS = [
  "/auth/refresh-token",
  "/auth/login",
  "/auth/logout",
];

/**
 * Processes the raw Fetch Response into a typed data object.
 * Supports both the V2 envelope { success, data } / { error: { type, message } }
 * and the legacy V1 shape { error: string, message: string }.
 */
const handleResponse = async (response: Response): Promise<any> => {
  let responseData: ApiResponse;

  try {
    responseData = await response.json();
  } catch {
    const rawText = await response.text().catch(() => "Unknown error");
    throw new ApiError(
      response.status,
      { message: rawText },
      "Failed to parse response JSON.",
    );
  }

  // Success path: HTTP 2xx + success: true
  if (response.ok && (responseData as ApiSuccessResponse).success === true) {
    return (responseData as ApiSuccessResponse).data;
  }

  // Error path: extract the best human-readable message from either shape
  const errData = responseData as ApiErrorBody;
  const message = errData.error?.message || `Error: ${response.status}`;

  throw new ApiError(response.status, responseData, message);
};

// ── Headers ───────────────────────────────────────────────────────────────────

const getHeaders = async (
  isFileUpload: boolean = false,
): Promise<HeadersInit> => {
  const token = await TokenUtils.getToken();
  const headers: Record<string, string> = {};

  if (!isFileUpload) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

// ── Auth retry ────────────────────────────────────────────────────────────────

const handleNoAuth = async (
  requestFn: () => Promise<Response>,
): Promise<Response> => {
  try {
    await UserService.refreshToken();
    return await requestFn();
  } catch (error) {
    await UserService.logout();
    const msg = localizationService.t(
      "auth.session_expired",
      undefined,
      "Session expired. Please log in again.",
    );
    ToastService.showError(msg);
    throw new Error(msg);
  }
};

// ── Request engine ────────────────────────────────────────────────────────────

interface RequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  data?: any;
  isFileUpload?: boolean;
  signal?: AbortSignal;
}

const performRequest = async <T>(config: RequestConfig): Promise<T> => {
  const { method, endpoint, data, isFileUpload, signal } = config;

  const requestFn = async (): Promise<Response> => {
    const headers = await getHeaders(isFileUpload);
    const url = `${API_BASE_URL}${endpoint}`;

    return fetch(url, {
      method,
      headers,
      signal,
      credentials: "include",
      body: isFileUpload
        ? data
        : data !== undefined
          ? JSON.stringify(data)
          : undefined,
    });
  };

  let response = await requestFn();

  const shouldSkipRefresh = NO_REFRESH_ENDPOINTS.some((e) =>
    endpoint.startsWith(e),
  );

  if (
    (response.status === 401 || response.status === 403) &&
    !shouldSkipRefresh
  ) {
    response = await handleNoAuth(requestFn);
  }

  return handleResponse(response);
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Global API Utility Service.
 * Provides a type-safe interface for RESTful communication and SSE streaming.
 */
const ApiUtils = {
  isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  },

  get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return performRequest<T>({ method: "GET", endpoint, signal });
  },

  getWithParams<T extends Record<string, any>, R>(
    endpoint: string,
    params: T,
    signal?: AbortSignal,
  ): Promise<R> {
    const query = new URLSearchParams(params).toString();
    return performRequest<R>({
      method: "GET",
      endpoint: `${endpoint}${query ? `?${query}` : ""}`,
      signal,
    });
  },

  post<T, R>(endpoint: string, data?: T): Promise<R> {
    return performRequest<R>({ method: "POST", endpoint, data });
  },

  upload<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "POST",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  patchFile<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "PATCH",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  put<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PUT", endpoint, data });
  },

  patch<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PATCH", endpoint, data });
  },

  delete<R>(endpoint: string): Promise<R> {
    return performRequest<R>({ method: "DELETE", endpoint });
  },

  /**
   * Initializes a Server-Sent Events (SSE) stream.
   * Obtains a one-time ticket via POST /auth/request-ticket (no body required in V2),
   * then opens an EventSource with the ticket as a query parameter.
   *
   * @param endpoint     The streaming endpoint path (e.g. "/sales")
   * @param onMessage    Called for every default `message` event
   * @param onError      Called on stream errors
   * @param onDone       Called when the server emits the "done" event
   * @returns            A cleanup function that closes the EventSource
   */
  async stream<T = any>(
    endpoint: string,
    onMessage: (data: { data: T }) => void,
    onError?: (err: any) => void,
    onDone?: (doneData?: { total?: number; status?: string }) => void,
  ): Promise<() => void> {
    try {
      // V2: POST /auth/request-ticket requires no request body
      const { ticket } = await this.post<null, { ticket: string }>(
        "/auth/request-ticket",
      );

      if (!ticket) throw new Error("SSE Ticket Missing");

      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${API_BASE_URL}${endpoint}${separator}ticket=${encodeURIComponent(ticket)}`;

      const eventSource = new EventSource(url, { withCredentials: true });

      const cleanup = () => {
        if (eventSource.readyState !== eventSource.CLOSED) {
          eventSource.close();
        }
      };

      eventSource.onmessage = (e) => {
        try {
          if (!e.data) return;
          onMessage({ data: JSON.parse(e.data) });
        } catch (err) {
          console.error("SSE Parse Error:", err);
          onError?.(err);
        }
      };

      // V2 "done" event carries { total: number } (sales) or { status: "completed" } (more-info)
      eventSource.addEventListener("done", (e: MessageEvent) => {
        let doneData: { total?: number; status?: string } | undefined;
        try {
          doneData = e.data ? JSON.parse(e.data) : undefined;
        } catch {
          // Non-JSON done payload — ignore
        }
        onDone?.(doneData);
        cleanup();
      });

      // V2 named "error" event from server (distinct from the EventSource connection error)
      eventSource.addEventListener("error", (e: MessageEvent) => {
        try {
          const errData = e.data ? JSON.parse(e.data) : {};
          onError?.(errData);
        } catch {
          onError?.(e);
        }
        cleanup();
      });

      // Connection-level error (network drop, server closed)
      eventSource.onerror = (err) => {
        if (eventSource.readyState === eventSource.CLOSED) return;
        onError?.(err);
        cleanup();
      };

      return cleanup;
    } catch (err) {
      console.error("SSE Initialization Error:", err);
      onError?.(err);
      return () => {};
    }
  },
};

export default ApiUtils;
export { ApiError };
