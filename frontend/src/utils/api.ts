import ToastService from '@/services/ToastService';
import AuthUtils from './authUtils';

const API_URL = 'http://localhost:5000';
const API_BASE_PATH = '/api/v1';
const API_BASE_URL = `${API_URL}${API_BASE_PATH}`;

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'An error occurred');
  }
  return response.json();
};

const getAuthHeaders = (): HeadersInit => {
  const token = AuthUtils.getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handle403 = async (requestFn: () => Promise<Response>) => {
  try {
    await AuthUtils.refreshToken();
    return await requestFn();
  } catch (error) {
    ToastService.showError('Token refresh failed. Logging out...');
    await AuthUtils.logout();
    throw new Error('Session expired. You have been logged out.');
  }
};

const makeRequest = async <T>(
  method: 'GET' | 'POST' | 'PUT',
  endpoint: string,
  data?: any
): Promise<T> => {
  const requestFn = () =>
    fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: getAuthHeaders(),
      credentials: 'include',
      ...(data && { body: JSON.stringify(data) }),
    });

  let response = await requestFn();
  if (response.status === 403) {
    response = await handle403(requestFn);
  }

  return handleResponse(response);
};

const ApiUtils = {
  get<T>(endpoint: string): Promise<T> {
    return makeRequest<T>('GET', endpoint);
  },

  post<T, R>(endpoint: string, data: T): Promise<R> {
    return makeRequest<R>('POST', endpoint, data);
  },

  put<T, R>(endpoint: string, data: T): Promise<R> {
    return makeRequest<R>('PUT', endpoint, data);
  },
};

export default ApiUtils;
