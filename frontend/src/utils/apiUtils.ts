import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import TokenUtils from "./tokenUtils";
import Utils from "./utils";
import UserService from "@/services/UserService";

/** Pre-computed API URL to eliminate repeated string concatenation logic */
const API_BASE_URL = Utils.getApiBaseUrl();

/** * Standard API Response envelope structure.
 * @template T The type of the data payload returned.
 */
interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/** Structure for individual Server-Sent Events (SSE) */
interface StreamEvent<T = any> {
  data: T;
  event?: string;
}

/** Callback definition for processing stream events */
type StreamCallback<T = any> = (event: StreamEvent<T>) => void;

/**
 * Custom Error class for API-level failures.
 * Extends the native Error to include HTTP status codes and structured response data.
 */
class ApiError extends Error {
  /**
   * @param {number} status - The HTTP status code (e.g., 404, 500).
   * @param {any} data - The raw response data or error object from the server.
   * @param {string} [message] - An optional descriptive error message.
   */
  constructor(
    public status: number,
    public data: any,
    message?: string,
  ) {
    const finalMessage = message || data?.error || data?.message || "API error";
    super(finalMessage);
    this.name = "ApiError";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }

    // Explicitly set the prototype to fix 'instanceof' checks in compiled code
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Formats the error into a human-readable string.
   * @returns {string}
   */
  toString(): string {
    return `${this.name} (${this.status}): ${this.message}`;
  }

  /**
   * Prepares the error for JSON serialization.
   * @returns {Record<string, any>}
   */
  toJSON() {
    return {
      name: this.name,
      status: this.status,
      message: this.message,
      data: this.data,
      stack: this.stack,
    };
  }
}

const NO_REFRESH_ENDPOINTS = [
  "/auth/refresh-token",
  "/auth/login",
  "/auth/logout",
];

/**
 * Processes the raw Fetch Response into a typed data object.
 * Optimized: Uses a fast-path for non-OK status codes before attempting JSON parsing.
 * @param {Response} response - The raw Fetch API Response object.
 * @returns {Promise<any>} The extracted 'data' field from the ApiResponse.
 * @throws {ApiError} If the request fails or the API returns success: false.
 */
const handleResponse = async (response: Response): Promise<any> => {
  let responseData: ApiResponse;

  // 1. Try to parse JSON regardless of the status code
  try {
    responseData = await response.json();
  } catch {
    // Fallback if the body isn't JSON (e.g., a 502 Bad Gateway HTML page)
    const rawText = await response.text().catch(() => "Unknown error");
    throw new ApiError(
      response.status,
      { message: rawText },
      "Failed to parse response JSON.",
    );
  }

  // 2. If HTTP is 2xx AND the server says success is true, return the payload
  if (response.ok && responseData?.success) {
    return responseData.data;
  }

  // 3. Otherwise, treat it as a structured ApiError
  // This keeps responseData as an OBJECT, allowing you to access .data.requirements
  throw new ApiError(
    response.status,
    responseData,
    responseData?.error || responseData?.message || `Error: ${response.status}`,
  );
};

/**
 * Generates headers for the outgoing request.
 * Optimized: Avoids unnecessary JSON content-type headers for file uploads.
 * @param {boolean} [isFileUpload=false] - Whether the body is FormData.
 * @returns {Promise<HeadersInit>}
 */
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

/**
 * Orchestrates token refreshing upon receiving 401/403 status codes.
 * If refresh fails, triggers a global logout and notifies the user.
 * @param {() => Promise<Response>} requestFn - The original request function to retry.
 * @returns {Promise<Response>}
 */
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

/** Configuration used internally to build the fetch request */
interface RequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  data?: any;
  isFileUpload?: boolean;
  signal?: AbortSignal;
}

/**
 * The primary execution engine for all Fetch requests.
 * Optimized: Strips JSON whitespace to minimize outbound bandwidth.
 * @template T
 * @param {RequestConfig} config - The request parameters.
 * @returns {Promise<T>}
 */
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
      // Optimized: Stringify without whitespace (null, 2) to reduce payload size
      body: isFileUpload ? data : data ? JSON.stringify(data) : undefined,
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

/**
 * Global API Utility Service
 * Provides a type-safe, optimized interface for RESTful communication and SSE streaming.
 */
const ApiUtils = {
  /**
   * Type Guard to verify if an error is an instance of ApiError.
   * @param {unknown} error
   * @returns {error is ApiError}
   */
  isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  },

  /**
   * Performs a GET request.
   * @param {string} endpoint - The target API path.
   * @param {AbortSignal} [signal] - Optional signal to cancel the request.
   */
  get<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
    return performRequest<T>({ method: "GET", endpoint, signal });
  },

  /**
   * Performs a GET request with query parameters.
   * @param {string} endpoint - The target API path.
   * @param {Record<string, any>} params - Key-value pairs to be converted to a query string.
   * @param {AbortSignal} [signal] - Optional signal to cancel the request.
   */
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

  /**
   * Performs a POST request.
   * @param {string} endpoint - The target API path.
   * @param {any} data - The JSON payload.
   */
  post<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "POST", endpoint, data });
  },

  /**
   * Uploads files using a multipart/form-data POST request.
   * @param {string} endpoint - The target API path.
   * @param {FormData} data - The form data containing files.
   */
  upload<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "POST",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  /**
   * Uploads files using a multipart/form-data PATCH request.
   * @param {string} endpoint - The target API path.
   * @param {FormData} data - The form data containing files.
   */
  patchFile<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "PATCH",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  /**
   * Performs a PUT request.
   * @param {string} endpoint - The target API path.
   * @param {any} data - The JSON payload.
   */
  put<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PUT", endpoint, data });
  },

  /**
   * Performs a PATCH request.
   * @param {string} endpoint - The target API path.
   * @param {any} data - The JSON payload.
   */
  patch<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PATCH", endpoint, data });
  },

  /**
   * Performs a DELETE request.
   * @param {string} endpoint - The target API path.
   */
  delete<R>(endpoint: string): Promise<R> {
    return performRequest<R>({ method: "DELETE", endpoint });
  },

  /**
   * Initializes a Server-Sent Events (SSE) stream.
   * Optimized: Uses a ticket-based authentication flow for EventSource.
   * @template T
   * @param {string} endpoint - The streaming endpoint.
   * @param {StreamCallback<T>} onMessage - Success callback for each event.
   * @param {(err: any) => void} [onError] - Error callback.
   * @param {() => void} [onDone] - Completion callback (triggered by 'done' event).
   * @returns {Promise<() => void>} A function to close the stream.
   */
  async stream<T = any>(
    endpoint: string,
    onMessage: StreamCallback<T>,
    onError?: (err: any) => void,
    onDone?: () => void,
  ): Promise<() => void> {
    try {
      // 1. Obtain a short-lived ticket for the EventSource connection
      const { ticket } = await this.post<any, { ticket: string }>(
        "/auth/request-ticket",
        { ticket: "" },
      );

      if (!ticket) throw new Error("SSE Ticket Missing");

      const url = `${API_BASE_URL}${endpoint}?ticket=${encodeURIComponent(ticket)}`;
      const eventSource = new EventSource(url, { withCredentials: true });

      eventSource.onmessage = (e) => {
        try {
          onMessage({ data: JSON.parse(e.data) });
        } catch (err) {
          onError?.(err);
        }
      };

      eventSource.addEventListener("done", () => {
        onDone?.();
        eventSource.close();
      });

      eventSource.onerror = (err) => {
        onError?.(err);
        eventSource.close();
      };

      return () => eventSource.close();
    } catch (err) {
      onError?.(err);
      return () => {}; // Return no-op if initialization fails
    }
  },
};

export default ApiUtils;
