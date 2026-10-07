import { defineStore, type Pinia } from "pinia";
import ApiUtils from "@/utils/apiUtils";
import TokenUtils from "@/utils/tokenUtils";
import Utils from "@/utils/utils";
import storageService from "@/services/general/StorageService";
import { BaseService } from "@/services/base/BaseService";
import { handleRequest } from "@/utils/requestFeedback";
import { pinia as appPinia, resetAllStores } from "./pinia";

const BASE_ENDPOINT = "/auth";
const RESOURCE_KEY = "auth.title";
const REFRESH_RETRY_DELAY_MS = 1000;

class RefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefreshError";
  }
}

const decodeToken = (token: string | null): AuthToken | null => {
  if (!token) return null;
  try {
    const bytes = Uint8Array.from(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return { id: payload.id, username: payload.username, role: payload.role };
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
};

/** One refresh at a time: concurrent callers share the in-flight promise. */
let inflightRefresh: Promise<string> | null = null;

/** Where to send the user once the local session is gone; set by the app shell. */
let redirectToLogin: (() => Promise<void>) | null = null;

export const setLoginRedirect = (redirect: (() => Promise<void>) | null): void => {
  redirectToLogin = redirect;
};

export const useSessionStore = defineStore("session", {
  state: () => ({
    token: null as string | null,
    hydrated: false,
  }),

  getters: {
    identity: (state): AuthToken | null => decodeToken(state.token),
    isAuthenticated: (state): boolean => !!state.token,
    username(): string {
      return this.identity?.username ?? "";
    },
    role(): UserRole | null {
      return this.identity?.role ?? null;
    },
    userId(): number {
      return this.identity?.id ?? -1;
    },
    isAdmin(): boolean {
      return this.role === "admin";
    },
    isGuest(): boolean {
      return this.role === "guest";
    },
  },

  actions: {
    /** Loads the persisted token once. */
    async hydrate(): Promise<void> {
      if (this.hydrated) return;
      this.token = await TokenUtils.getToken();
      this.hydrated = true;
    },

    async storeToken(token: string): Promise<void> {
      this.token = token;
      this.hydrated = true;
      await TokenUtils.setToken(token);
    },

    async register(data: RegisterData) {
      return handleRequest(
        ApiUtils.post(`${BASE_ENDPOINT}/register`, data),
        RESOURCE_KEY,
        "auth.registration_failed",
      );
    },

    async login(data: LoginData): Promise<LoginResponse> {
      const response = (await handleRequest(
        ApiUtils.post(`${BASE_ENDPOINT}/login`, data),
        RESOURCE_KEY,
        "auth.login_failed",
      )) as LoginResponse;
      await this.storeToken(response.accessToken);
      return response;
    },

    async guestLogin(): Promise<LoginResponse> {
      const response = (await handleRequest(
        ApiUtils.post(`${BASE_ENDPOINT}/login/guest`, null),
        RESOURCE_KEY,
        "auth.failed_guest",
      )) as LoginResponse;
      await this.storeToken(response.accessToken);
      return response;
    },

    /** Ends the session on the server (best effort), then locally. */
    async logout(): Promise<void> {
      try {
        await ApiUtils.post(`${BASE_ENDPOINT}/logout`, null);
      } catch (error) {
        console.error("Server logout error:", error);
      } finally {
        await this.localLogout();
      }
    },

    /** Drops every trace of the account from memory and storage and leaves the app. */
    async localLogout(): Promise<void> {
      BaseService.clearMemoryCache();
      resetAllStores();
      await TokenUtils.clearToken();
      await storageService.clear();
      this.token = null;
      this.hydrated = true;
      await redirectToLogin?.();
    },

    /**
     * Exchanges the refresh cookie for a new access token. Concurrent calls
     * share one request. A rejected refresh token (401) is final; other
     * failures are retried.
     */
    refresh(retryCount = 3): Promise<string> {
      inflightRefresh ??= this.requestNewToken(retryCount).finally(() => {
        inflightRefresh = null;
      });
      return inflightRefresh;
    },

    async requestNewToken(retryCount: number): Promise<string> {
      const url = `${Utils.getApiBaseUrl()}${BASE_ENDPOINT}/refresh-token`;

      for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });

          if (response.status === 401) throw new RefreshError("Refresh token expired");

          if (!response.ok) {
            let message = `HTTP ${response.status}`;
            try {
              const body = await response.json();
              message =
                body?.error?.message ||
                (typeof body?.error === "string" ? body.error : undefined) ||
                body?.message ||
                message;
            } catch {
              // Non-JSON body: keep the HTTP status message
            }
            throw new RefreshError(message);
          }

          const accessToken = (await response.json()).data?.accessToken;
          if (!accessToken) throw new RefreshError("Invalid response structure");

          await this.storeToken(accessToken);
          return accessToken;
        } catch (error) {
          const final =
            attempt === retryCount ||
            (error instanceof RefreshError && error.message.includes("expired"));
          if (final) throw error;
          await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS));
        }
      }
      throw new RefreshError("Refresh failed");
    },

    /** True when a token exists or one can be obtained from the refresh cookie. */
    async ensureAuthenticated(): Promise<boolean> {
      await this.hydrate();
      if (!this.token) await this.refresh(1).catch(() => null);
      return this.isAuthenticated;
    },

    async editProfile(data: EditProfile) {
      return handleRequest(
        ApiUtils.patch(`${BASE_ENDPOINT}/me`, data),
        "profile.title",
        "profile.update_failed",
      );
    },

    async deleteProfile() {
      const response = await handleRequest(
        ApiUtils.delete(`${BASE_ENDPOINT}/me`),
        "profile.title",
        "profile.delete_failed",
      );
      // Full wipe including keepOnClear data: the account is gone.
      await storageService.clearAll();
      await this.localLogout();
      return response;
    },
  },
});

/** Lets the transport renew and tear down the session without importing the store. */
export const connectSessionToTransport = (pinia: Pinia): void => {
  ApiUtils.configureAuth({
    refresh: () => useSessionStore(pinia).refresh(),
    onAuthFailure: () => useSessionStore(pinia).localLogout(),
  });
};

/** The signed-in user's id for code that has no component context; -1 when signed out. */
export const currentUserId = (): number => useSessionStore(appPinia).userId;
