import { BaseService } from "./base/BaseService";
import ApiUtils from "@/utils/apiUtils";
import TokenUtils from "@/utils/tokenUtils";
import router from "@/router";
import Utils from "@/utils/utils";

const BASE_ENDPOINT = "/auth";
const RESOURCE_KEY = "auth.title"; // Localization key for authentication context

export default class UserService extends BaseService {
  /**
   * Internal helper to decode JWT payload
   */
  private static async decodeAuthToken(): Promise<AuthToken | null> {
    const token = await TokenUtils.getToken();
    if (!token) return null;
    try {
      const decoded = JSON.parse(atob(token.split(".")[1]));
      return {
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
      } as AuthToken;
    } catch (error) {
      console.error("Error decoding token:", error);
      return null;
    }
  }

  static async register(data: RegisterData) {
    return this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/register`, data),
      RESOURCE_KEY,
      "auth.registration_failed",
    );
  }

  static async login(data: LoginData) {
    const response = (await this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/login`, data),
      RESOURCE_KEY,
      "auth.login_failed",
    )) as LoginResponse;

    await TokenUtils.setToken(response.accessToken);
    return response;
  }

  static async guestLogin() {
    const response = (await this.handleRequest(
      ApiUtils.post(`${BASE_ENDPOINT}/login/guest`, null),
      RESOURCE_KEY,
      "auth.failed_guest",
    )) as LoginResponse;

    await TokenUtils.setToken(response.accessToken);
    return response;
  }

  static async logout() {
    try {
      // Best effort notify server, then clear local
      await ApiUtils.post(`${BASE_ENDPOINT}/logout`, null);
    } catch (error) {
      console.error("Server logout error:", error);
    } finally {
      await this.handleLocalLogout();
    }
  }

  static async handleLocalLogout() {
    await TokenUtils.clearToken();
    router.replace({ name: "login" }).then(() => window.location.reload());
  }

  private static RefreshError = class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RefreshError";
    }
  };

  /**
   * Robust Token Refresh logic with retry mechanism
   */
  static async refreshToken(retryCount = 3) {
    const url = `${Utils.getApiBaseUrl()}${BASE_ENDPOINT}/refresh-token`;

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        });

        if (!response.ok)
          throw new this.RefreshError(`HTTP ${response.status}`);

        const res = await response.json();
        if (!res.data?.accessToken)
          throw new this.RefreshError("Invalid response structure");

        await TokenUtils.setToken(res.data.accessToken);
        return;
      } catch (error) {
        if (attempt === retryCount) {
          await this.handleRequest(
            Promise.reject(error),
            RESOURCE_KEY,
            "auth.refresh_failed",
          );
          await this.logout();
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  static async editProfile(data: EditProfile) {
    return this.handleRequest(
      ApiUtils.put(`${BASE_ENDPOINT}/update`, data),
      "profile.title",
      "profile.update_failed",
    );
  }

  static async deleteProfile() {
    return this.handleRequest(
      ApiUtils.delete(`${BASE_ENDPOINT}/delete`),
      "profile.title",
      "profile.delete_failed",
    );
  }

  // --- Identity & Role Getters ---

  static async isAuthenticated(): Promise<boolean> {
    const token = await TokenUtils.getToken();

    if (!token) await this.refreshToken(1).catch(() => null);
    const refreshedToken = await TokenUtils.getToken();
    return !!refreshedToken;
  }

  static async getUsername(): Promise<string> {
    const payload = await this.decodeAuthToken();
    return payload?.username || "";
  }

  static async getUserRole(): Promise<UserRole | null> {
    const payload = await this.decodeAuthToken();
    return payload?.role || null;
  }
  
  static async getUserId(): Promise<number> {
    const payload = await this.decodeAuthToken();
    return payload?.id || -1;
  }

  static async isAdmin(): Promise<boolean> {
    const role = await this.getUserRole();
    return role === "admin";
  }

  static async isGuest(): Promise<boolean> {
    const role = await this.getUserRole();
    return role === "guest";
  }
}
