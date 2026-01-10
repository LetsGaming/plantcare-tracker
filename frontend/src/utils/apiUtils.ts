import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import TokenUtils from "./tokenUtils";
import Utils from "./utils";

import UserService from "@/services/UserService";

const API_BASE_URL = Utils.getApiBaseUrl();

interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

interface StreamEvent<T = any> {
  data: T;
  event?: string;
}

type StreamCallback<T = any> = (event: StreamEvent<T>) => void;

class ApiError extends Error {
  constructor(public status: number, public data: any, message?: string) {
    const finalMessage = message || data?.error || data?.message || "API error";
    super(finalMessage);

    this.name = "ApiError";

    /**
     * Fix the prototype chain.
     * Required when extending built-in classes like Error in TypeScript/ES5
     * so that 'instanceof ApiError' returns true.
     */
    Object.setPrototypeOf(this, ApiError.prototype);

    // Capture stack trace (Available in V8 environments like Node/Chrome)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Helper to format the error for logging
   */
  toString(): string {
    return `${this.name} (status: ${this.status}): ${this.message}`;
  }

  /**
   * Helper to format the error for JSON serialization (e.g., sending to another service)
   */
  toJSON() {
    return {
      name: this.name,
      status: this.status,
      message: this.message,
      data: this.data,
      stack: this.stack, // Optional: useful for debugging
    };
  }
}

/**
 * Handles the response by checking if the success flag is true or false.
 * If the success flag is false, it throws an error with the message from the error field.
 * @param {Response} response - The raw response from the API.
 * @returns {Promise<any>} - Parsed JSON data if the request was successful.
 * @throws {Error} - Throws an error with the error message if success: false.
 */
const handleResponse = async (response: Response): Promise<any> => {
  // Handle non-200 HTTP responses first
  if (!response.ok) {
    const text = await response.text();
    throw new ApiError(response.status, text, `HTTP ${response.status}`);
  }

  let responseData: ApiResponse;
  try {
    responseData = await response.json();
  } catch {
    throw new ApiError(response.status, null, "Failed to parse response JSON.");
  }

  // Validate response structure
  if (typeof responseData?.success !== "boolean") {
    throw new ApiError(
      response.status,
      responseData,
      "Unexpected response format."
    );
  }

  if (responseData.success) {
    // Optionally, handle the message here or let the caller handle it
    return responseData.data;
  }

  // API indicated failure
  throw new ApiError(
    response.status,
    responseData,
    responseData.error || responseData.message || "An unknown error occurred"
  );
};
/**
 * Retrieves authorization headers for requests (non-file uploads).
 * @returns {Promise<HeadersInit>} - The headers to be sent with the request.
 */
const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token = await TokenUtils.getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/**
 * Handles 403/401 responses by attempting to refresh the token and retrying the request.
 * If the token refresh fails, it logs out the user.
 * @param {() => Promise<Response>} requestFn - The function to retry the request.
 * @returns {Promise<Response>} - The response after retrying with a refreshed token.
 */
const handleNoAuth = async (
  requestFn: () => Promise<Response>
): Promise<Response> => {
  try {
    await UserService.refreshToken();
    return await requestFn();
  } catch (error) {
    await UserService.logout();
    ToastService.showError({ key: 'auth.session_expired', fallback: 'Session expired. You have been logged out.' });
    throw new Error(localizationService.t('auth.session_expired') || "Session expired. You have been logged out.");
  }
};

interface RequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  data?: any;
  isFileUpload?: boolean;
}

/**
 * Performs an API request based on the given configuration.
 * This function builds the fetch request, handles unauthorized responses,
 * and returns parsed response data.
 * @param {RequestConfig} config - The configuration for the request.
 * @returns {Promise<T>} - The parsed response data.
 */
const performRequest = async <T>(config: RequestConfig): Promise<T> => {
  const { method, endpoint, data, isFileUpload } = config;

  // Build the request function based on whether it is a file upload or not.
  const requestFn = async (): Promise<Response> => {
    if (isFileUpload) {
      const token = await TokenUtils.getToken();
      const headers: HeadersInit = token
        ? { Authorization: `Bearer ${token}` }
        : {};
      return fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        credentials: "include",
        body: data, // data should be an instance of FormData
      });
    } else {
      // For non-file
      const headers = await getAuthHeaders();
      return fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        credentials: "include",
        ...(data ? { body: JSON.stringify(data, null, 2) } : {}),
      });
    }
  };

  let response = await requestFn();

  // Handle unauthorized or forbidden responses (excluding login endpoint)
  if (
    (response.status === 403 || response.status === 401) &&
    !endpoint.includes("login")
  ) {
    response = await handleNoAuth(requestFn);
  }

  return handleResponse(response);
};

/**
 * Utility functions for making API requests.
 */
const ApiUtils = {
  /**
   * TypeScript Type Guard
   * Use this in catch blocks to safely narrow the type to ApiError.
   */
  isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  },

  /**
   * Makes a GET request to the specified endpoint.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request.
   * @returns {Promise<T>} - The parsed response data.
   */
  get<T>(endpoint: string): Promise<T> {
    return performRequest<T>({ method: "GET", endpoint });
  },

  /**
   * Makes a GET request to the specified endpoint with the provided data.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request (usually an object).
   * @returns {Promise<R>} - The parsed response data.
   */
  getWithParams<T extends Record<string, string> | undefined, R>(
    endpoint: string,
    data: T
  ): Promise<R> {
    // Use URLSearchParams to convert the object into a query string
    const queryString = new URLSearchParams(data).toString();
    return performRequest<R>({
      method: "GET",
      endpoint: `${endpoint}?${queryString}`,
    });
  },

  /**
   * Makes a POST request to the specified endpoint with the provided data.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request.
   * @returns {Promise<R>} - The parsed response data.
   */
  post<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "POST", endpoint, data });
  },

  /**
   * Uploads files to the specified endpoint using FormData.
   * Note: 'data' should be an instance of FormData.
   * @param {string} endpoint - The API endpoint to call.
   * @param {FormData} data - The FormData containing the files and any additional data.
   * @returns {Promise<R>} - The parsed response data.
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
   * Makes a PUT request to the specified endpoint with the provided data.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request.
   * @returns {Promise<R>} - The parsed response data.
   */
  put<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PUT", endpoint, data });
  },

  /**
   * Makes a PATCH request to the specified endpoint with the provided data.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request.
   * @returns {Promise<R>} - The parsed response data.
   */
  patch<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PATCH", endpoint, data });
  },

  /**
   * Makes a PATCH request to the specified endpoint with the provided data.
   * This function is specifically for uploading images.
   * @param {string} endpoint - The API endpoint to call.
   * @param {T} data - The data to send with the request.
   * @returns {Promise<R>} - The parsed response data.
   */
  patchImage<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({
      method: "PATCH",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  /**
   * Makes a DELETE request to the specified endpoint.
   * @param {string} endpoint - The API endpoint to call.
   * @returns {Promise<R>} - A promise that resolves when the delete is successful.
   */
  delete<R>(endpoint: string): Promise<R> {
    return performRequest<R>({ method: "DELETE", endpoint });
  },

  /**
   * Streams events from an SSE endpoint.
   * @param endpoint - API endpoint that returns SSE.
   * @param onMessage - Callback for each streamed event.
   * @param onError - Optional callback for errors.
   * @returns A function to stop the stream.
   */
  stream<T = any>(
    endpoint: string,
    onMessage: StreamCallback<T>,
    onError?: (err: any) => void,
    onDone?: () => void
  ): () => void {
    const url = `${API_BASE_URL}${endpoint}`;
    const eventSource = new EventSource(url, { withCredentials: true });

    eventSource.onmessage = (e) => {
      try {
        const parsed: T = JSON.parse(e.data);
        onMessage({ data: parsed });
      } catch (err) {
        console.error("Failed to parse SSE data:", e.data, err);
        onError?.(err);
      }
    };

    eventSource.addEventListener("done", () => {
      onDone?.();
      eventSource.close();
    });

    eventSource.onerror = (err) => {
      console.error("SSE stream error:", err);
      onError?.(err);
      eventSource.close();
    };

    return () => eventSource.close();
  },
};

export default ApiUtils;
