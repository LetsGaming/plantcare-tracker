import ApiUtils from "@/utils/apiUtils";
import TokenUtils from "@/utils/tokenUtils";
import ToastService from "@/services/general/ToastService";
import router from "@/router";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/auth";

const decodeAuthToken = async () => {
  const token = await TokenUtils.getToken();
  if (!token) return null;

  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
};

export default class UserService {
  static async register(data: RegisterData) {
    return ApiUtils.post(`${BASE_ENDPOINT}/register`, data);
  }

  static async login(data: LoginData) {
    try {
      const response = (await ApiUtils.post(
        `${BASE_ENDPOINT}/login`,
        data
      )) as LoginResponse;
      await TokenUtils.setToken(response.accessToken);
      return response;
    } catch (error) {
      ToastService.showError("Login failed. Please try again.");
      throw error;
    }
  }

  static async guestLogin() {
    try {
      const response = (await ApiUtils.post(
        `${BASE_ENDPOINT}/login/guest`,
        null
      )) as LoginResponse;
      await TokenUtils.setToken(response.accessToken);
      return response;
    } catch (error) {
      ToastService.showError("Guest login failed. Please try again.");
      throw error;
    }
  }

  static async logout() {
    try {
      await ApiUtils.post(`${BASE_ENDPOINT}/logout`, null);
    } catch (error) {
      console.error("Error logging out:", error);
    } finally {
      await this.handleLocalLogout();
    }
  }

  static async handleLocalLogout() {
    await TokenUtils.clearToken();
    router.replace({ name: "login" }).then(() => window.location.reload());
  }

  static async refreshToken(retryCount = 3) {
    const API_BASE_URL = Utils.getApiBaseUrl();
    const url = `${API_BASE_URL}${BASE_ENDPOINT}/refresh-token`;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!response.ok)
          throw new Error(`HTTP error! Status: ${response.status}`);

        const res = await response.json();
        if (!res.data.accessToken)
          throw new Error("Invalid response structure");

        await TokenUtils.setToken(res.data.accessToken);
        return;
      } catch (error) {
        console.error(`Attempt ${attempt} to refresh token failed: ${error}`);
        if (attempt === retryCount) {
          ToastService.showError("Failed to refresh token. Logging out...");
          await this.logout();
          throw new Error("Token refresh failed");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  static async editProfile(data: EditProfile) {
    try {
      return ApiUtils.put(`${BASE_ENDPOINT}/update`, data);
    } catch (error) {
      ToastService.showError("Profile update failed. Please try again.");
    }
  }

  static async deleteProfile() {
    try {
      return ApiUtils.delete(`${BASE_ENDPOINT}/delete`);
    } catch (error) {
      ToastService.showError("Profile deletion failed. Please try again.");
    }
  }

  static async isAuthenticated() {
    return (await TokenUtils.getToken()) !== null;
  }

  static async getUsername() {
    const payload = await decodeAuthToken();
    return payload?.username || "";
  }

  static async getUserRole() {
    const payload = await decodeAuthToken();
    return payload?.role || "";
  }

  static async isAdmin() {
    return (await this.getUserRole()).toLowerCase() === "admin";
  }

  static async isGuest() {
    return (await this.getUserRole()).toLowerCase() === "guest";
  }
}
