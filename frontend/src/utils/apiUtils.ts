import ToastService from '@/services/general/ToastService';
import AuthUtils from './authUtils';

const API_URL = 'http://localhost:5000';
const API_BASE_PATH = '/api/v1';
const API_BASE_URL = `${API_URL}${API_BASE_PATH}`;

/**
 * Handles the response by checking if the success flag is true or false.
 * If the success flag is false, it throws an error with the message from the error field.
 * @param {Response} response - The raw response from the API.
 * @returns {Promise<any>} - Parsed JSON data if the request was successful.
 * @throws {Error} - Throws an error with the error message if success: false.
 */
const handleResponse = async (response: Response) => {
  const responseData = await response.json();

  if (responseData.success) {
    return responseData.data;  // Return the data field when success is true
  } else {
    throw new Error(responseData.error || 'An unknown error occurred');  // Throw the error message
  }
};

/**
 * Get the authorization headers for requests, including the token if available.
 * @returns {HeadersInit} - The headers to be sent with the request.
 */
const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token = await AuthUtils.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

/**
 * Handle 403 responses by refreshing the token and retrying the request.
 * If the token refresh fails, log the user out.
 * @param {() => Promise<Response>} requestFn - The function to retry the request.
 * @returns {Promise<Response>} - The response after retrying with a refreshed token.
 */
const handle403 = async (requestFn: () => Promise<Response>) => {
  try {
    await AuthUtils.refreshToken();
    return await requestFn();
  } catch (error) {
    ToastService.showError('Session expired. You have been logged out.');
    await AuthUtils.logout();
    throw new Error('Session expired. You have been logged out.');
  }
};

/**
 * Makes an API request using the specified method, endpoint, and optional data.
 * Handles token refresh on 403 status and processes the response.
 * @param {'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} method - The HTTP method to use for the request.
 * @param {string} endpoint - The API endpoint to call.
 * @param {any} [data] - The data to send with the request (for POST/PUT/PATCH).
 * @returns {Promise<T>} - The parsed response data.
 */
const makeRequest = async <T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  endpoint: string,
  data?: any
): Promise<T> => {
  const requestFn = async () =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: await getAuthHeaders(),
      credentials: 'include',
      ...(data && { body: JSON.stringify(data) }),
    });

  let response = await requestFn();
  if (response.status === 403) {
    response = await handle403(requestFn);
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
   * @returns {Promise<T>} - The parsed response data.
   */
  get<T>(endpoint: string): Promise<T> {
    return makeRequest<T>('GET', endpoint);
  },

  /**
   * Makes a POST request to the specified endpoint with the provided data.
   * @param {T} data - The data to send with the request.
   * @param {string} endpoint - The API endpoint to call.
   * @returns {Promise<R>} - The parsed response data.
   */
  post<T, R>(endpoint: string, data: T): Promise<R> {
    return makeRequest<R>('POST', endpoint, data);
  },

  /**
   * Makes a PUT request to the specified endpoint with the provided data.
   * @param {T} data - The data to send with the request.
   * @param {string} endpoint - The API endpoint to call.
   * @returns {Promise<R>} - The parsed response data.
   */
  put<T, R>(endpoint: string, data: T): Promise<R> {
    return makeRequest<R>('PUT', endpoint, data);
  },

  /**
   * Makes a PATCH request to the specified endpoint with the provided data.
   * @param {T} data - The data to send with the request.
   * @param {string} endpoint - The API endpoint to call.
   * @returns {Promise<R>} - The parsed response data.
   */
  patch<T, R>(endpoint: string, data: T): Promise<R> {
    return makeRequest<R>('PATCH', endpoint, data);
  },

  /**
   * Makes a DELETE request to the specified endpoint.
   * @param {string} endpoint - The API endpoint to call.
   * @returns {Promise<void>} - A promise that resolves when the delete is successful.
   */
  async delete<T>(endpoint: string): Promise<void> {
    try {
      await makeRequest<void>('DELETE', endpoint);
      ToastService.showSuccess('Resource deleted successfully.');
    } catch (error) {
      console.error(`Error deleting resource at ${endpoint}:`, error);
      ToastService.showError(`Error deleting resource: ${error}`);
      throw error;
    }
  },
};

export default ApiUtils;
