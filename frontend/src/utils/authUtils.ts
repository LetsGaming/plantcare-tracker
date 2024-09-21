import ToastService from '@/services/ToastService';
import ApiService from './apiUtils';

const TOKEN_KEY = 'authToken';

const AuthUtils = {
  async register(data: RegisterData): Promise<{ id: number; username: string }> {
    return await ApiService.post<RegisterData, { id: number; username: string }>('/auth/register', data);
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await ApiService.post<LoginData, AuthResponse>('/auth/login', data);
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    return response;
  },

  async logout(): Promise<void> {
    await ApiService.post<null, { message: string }>('/auth/logout', null);
    localStorage.removeItem(TOKEN_KEY);
  },

  async refreshToken(): Promise<void> {
    try {
      const response = await ApiService.post<null, { accessToken: string }>('/auth/refresh-token', null);
      localStorage.setItem(TOKEN_KEY, response.accessToken); // Update token
    } catch (error) {
      ToastService.showError(`Failed to refresh token: ${error}`);
      throw new Error('Token refresh failed');
    }
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  isAuthenticated(): boolean {
    return this.getToken() !== null;
  }
};

export default AuthUtils;
