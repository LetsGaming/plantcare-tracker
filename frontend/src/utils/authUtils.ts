import ToastService from "@/services/general/ToastService";
import ApiService from "./apiUtils";
import storageService from "@/services/general/StorageService";
import router from "@/router";

const TOKEN_KEY = "authToken";

const AuthUtils = {
  async register(
    data: RegisterData
  ): Promise<{ id: number; username: string }> {
    return await ApiService.post<
      RegisterData,
      { id: number; username: string }
    >("/auth/register", data);
  },

  async login(data: LoginData): Promise<AuthResponse> {
    const response = await ApiService.post<LoginData, AuthResponse>(
      "/auth/login",
      data
    );
    await storageService.set(TOKEN_KEY, response.accessToken); // Use StorageService to store the token
    return response;
  },

  async logout(): Promise<void> {
    await ApiService.post<null, { message: string }>("/auth/logout", null);
    await storageService.remove(TOKEN_KEY); // Use StorageService to remove the token
    await router.push({ name: "login" });
  },

  async refreshToken(): Promise<void> {
    try {
      const response = await ApiService.post<null, { accessToken: string }>(
        "/auth/refresh-token",
        null
      );
      await storageService.set(TOKEN_KEY, response.accessToken); // Update token using StorageService
    } catch (error) {
      ToastService.showError(`Failed to refresh token: ${error}`);
      throw new Error("Token refresh failed");
    }
  },

  async getToken(): Promise<string | null> {
    return await storageService.get<string>(TOKEN_KEY); // Get token using StorageService
  },

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    return token !== null; // Check if token exists
  },

  async decodeAuthToken() {
    const token = await this.getToken();

    if (!token) return null;

    try {
      // JWT structure: header.payload.signature
      const payloadBase64 = token.split(".")[1]; // Get the payload part
      const decodedPayload = atob(payloadBase64); // Decode the Base64 payload
      const payloadObj = JSON.parse(decodedPayload); // Parse it to an object
      return payloadObj;
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  },

  async getUserRole(): Promise<string | null> {
    const payloadObj = await this.decodeAuthToken();

    return payloadObj.role || null;
  },

  async isAdmin(): Promise<boolean> {
    const role = await this.getUserRole();
    if (!role) return false;

    return role.toLowerCase() === "admin"; // Check if the role is 'admin'
  },
};

export default AuthUtils;
