import storageService from "@/services/general/StorageService";

const TOKEN_KEY = "authToken";

let token: string | null = null;
let expiresAtMs: number | null = null;
let loaded = false;
let loading: Promise<string | null> | null = null;

const decodeExpiry = (value: string | null): number | null => {
  if (!value) return null;
  try {
    const payload = JSON.parse(atob(value.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
};

const remember = (value: string | null): void => {
  token = value;
  expiresAtMs = decodeExpiry(value);
  loaded = true;
};

/**
 * The access token lives in memory; storage is touched only on hydrate, set
 * and clear, never per request.
 */
const TokenUtils = {
  isLoaded(): boolean {
    return loaded;
  },

  /** Synchronous read for the request path; null until `load` or `setToken` ran. */
  getTokenSync(): string | null {
    return token;
  },

  /** Epoch millis from the token's `exp` claim (decoded once per token), or null. */
  expiresAt(): number | null {
    return expiresAtMs;
  },

  /** Reads storage once; later calls answer from memory. */
  load(): Promise<string | null> {
    if (loaded) return Promise.resolve(token);
    loading ??= storageService
      .get<string>(TOKEN_KEY)
      .then((stored) => {
        if (!loaded) remember(stored);
        return token;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },

  async getToken(): Promise<string | null> {
    return this.load();
  },

  async setToken(value: string): Promise<void> {
    remember(value);
    await storageService.set(TOKEN_KEY, value);
  },

  async clearToken(): Promise<void> {
    remember(null);
    await storageService.remove(TOKEN_KEY);
  },

  /** Drops the in-memory copy so the next `load` reads storage again. */
  forget(): void {
    token = null;
    expiresAtMs = null;
    loaded = false;
    loading = null;
  },
};

export default TokenUtils;
