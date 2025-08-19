import ToastService from "@/services/general/ToastService";
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

/**
 * Handles the response by checking if the success flag is true or false.
 * If the success flag is false, it throws an error with the message from the error field.
 * @param {Response} response - The raw response from the API.
 * @returns {Promise<any>} - Parsed JSON data if the request was successful.
 * @throws {Error} - Throws an error with the error message if success: false.
 */
const handleResponse = async (response: Response): Promise<any> => {
  let responseData: ApiResponse;
  try {
    responseData = await response.json();
  } catch (error) {
    throw new Error("Failed to parse response JSON.");
  }
  if (
    typeof responseData !== "object" ||
    responseData === null ||
    typeof responseData.success !== "boolean"
  ) {
    throw new Error("Unexpected response format.");
  }
  if (responseData.success) {
    if (
      responseData.message &&
      responseData.message !== "Operation successful"
    ) {
      ToastService.showSuccess(responseData.message);
    }
    return responseData.data;
  } else {
    const errorMessage =
      responseData.error || responseData.message || "An unknown error occurred";
    throw new Error(errorMessage);
  }
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
    ToastService.showError("Session expired. You have been logged out.");
    throw new Error("Session expired. You have been logged out.");
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
};

export default ApiUtils;
