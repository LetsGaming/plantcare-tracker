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
    await storageService.clear();
    await router.push({ name: "login" });
  },

  async refreshToken(retryCount = 3): Promise<void> {
    const url = "/auth/refresh-token";
    const maxRetries = retryCount;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: null, // Adjust this if needed, currently matches `null` from ApiService
        });
  
        // Check for network and server errors
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
  
        const data = await response.json();
  
        // Validate response format (ensure accessToken exists)
        if (!data || !data.accessToken) {
          throw new Error("Invalid response structure: Missing accessToken");
        }
  
        // Update token using StorageService
        await storageService.set(TOKEN_KEY, data.accessToken);
  
        // Token refreshed successfully, exit function
        return;
  
      } catch (error) {
        console.error(`Attempt ${attempt} to refresh token failed: ${error}`);
  
        if (attempt === maxRetries) {
          // Maximum retry attempts reached, throw error
          ToastService.showError(`Failed to refresh token after ${maxRetries} attempts`);
          throw new Error("Token refresh failed after multiple attempts");
        }
  
        // Optionally, add a small delay between retries if needed
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
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
