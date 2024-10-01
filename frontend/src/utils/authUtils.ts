import router from "@/router";
import ToastService from "@/services/general/ToastService";
import ApiService from "./apiUtils";
import TokenService from "./tokenUtils";

/**
 * Authentication and authorization utility functions.
 */
const AuthUtils = {
  /**
   * Register a new user.
   * @param data - Registration data
   * @returns Registered user details.
   */
  async register(
    data: RegisterData
  ): Promise<{ id: number; username: string }> {
    return ApiService.post<RegisterData, { id: number; username: string }>(
      "/auth/register",
      data
    );
  },

  /**
   * Log in with credentials.
   * @param data - Login data
   * @returns Auth response with accessToken.
   */
  async login(data: LoginData): Promise<AuthResponse> {
    const response = await ApiService.post<LoginData, AuthResponse>(
      "/auth/login",
      data
    );
    await TokenService.setToken(response.accessToken); // Store the token using TokenService
    return response;
  },

  /**
   * Log out the current user.
   */
  async logout(): Promise<void> {
    await ApiService.post<null, { message: string }>("/auth/logout", null);
    await TokenService.clearToken();
    await router.push({ name: "login" });
  },

  /**
   * Refresh the authentication token directly using `fetch`.
   * Retries up to a maximum number of attempts if the token refresh fails.
   * @param retryCount - Number of retry attempts
   */
  async refreshToken(retryCount = 3): Promise<void> {
    const API_URL = "http://localhost:5000";
    const API_BASE_PATH = "/api/v1";
    const API_BASE_URL = `${API_URL}${API_BASE_PATH}`;

    const url = API_BASE_URL + "/auth/refresh-token";

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        // Direct fetch call to avoid circular dependencies and potential infinite loop
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: 'include',
          body: null, // No body needed for token refresh
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const res = await response.json();
        const accessToken = res.data.accessToken;
        if (!accessToken) {
          throw new Error("Invalid response structure: Missing accessToken");
        }
        
        // Store new token using TokenService
        await TokenService.setToken(accessToken);
        return; // Exit once token is refreshed successfully
      } catch (error) {
        console.error(`Attempt ${attempt} to refresh token failed: ${error}`);

        if (attempt === retryCount) {
          // Max retries reached, show error and log the user out
          ToastService.showError(
            `Failed to refresh token after ${retryCount} attempts.`
          );
          await this.logout(); // Log out if refresh fails
          throw new Error("Token refresh failed after multiple attempts");
        }

        // Optional delay between retries
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  },

  /**
   * Check if the user is authenticated by checking for a valid token.
   * @returns Whether the user is authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const token = await TokenService.getToken();
    return token !== null;
  },

  /**
   * Decode the JWT to get the payload.
   * @returns Decoded JWT payload, or null if invalid.
   */
  async decodeAuthToken(): Promise<any | null> {
    const token = await TokenService.getToken();

    if (!token) return null;

    try {
      const payloadBase64 = token.split(".")[1]; // Get the payload part
      const decodedPayload = atob(payloadBase64); // Decode Base64
      return JSON.parse(decodedPayload); // Parse JSON
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  },

  /**
   * Get the user role from the JWT payload.
   * @returns User role, or null if not found.
   */
  async getUserRole(): Promise<string | null> {
    const payload = await this.decodeAuthToken();
    return payload?.role || null;
  },

  /**
   * Check if the current user is an admin.
   * @returns Whether the user is an admin.
   */
  async isAdmin(): Promise<boolean> {
    const role = await this.getUserRole();
    return role?.toLowerCase() === "admin" || false;
  },
};

export default AuthUtils;
