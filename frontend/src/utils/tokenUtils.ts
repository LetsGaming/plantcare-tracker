import storageService from "@/services/general/StorageService";

const TOKEN_KEY = "authToken";

let token: string | null = null;
let expiresAtMs: number | null = null;
let loaded = false;
let loading: Promise<string | null> | null = null;

/** The claims of a JWT, decoded as UTF-8; throws on a malformed token. */
export const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const bytes = Uint8Array.from(
    atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
};

/**
 * A freshly received token is anchored to the local clock (receipt time plus
 * its lifetime) so a skewed device clock cannot make it look expired or
 * fresh. A token read back from storage has no receipt time, so its raw `exp`
 * is used.
 */
const decodeExpiry = (value: string | null, receivedNow: boolean): number | null => {
  if (!value) return null;
  try {
    const payload = decodeJwtPayload(value);
    const { exp, iat } = payload;
    if (typeof exp !== "number") return null;
    if (receivedNow && typeof iat === "number") return Date.now() + (exp - iat) * 1000;
    return exp * 1000;
  } catch {
    return null;
  }
};

const remember = (value: string | null, receivedNow: boolean): void => {
  token = value;
  expiresAtMs = decodeExpiry(value, receivedNow);
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
        if (!loaded) remember(stored, false);
        return token;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  },

  async setToken(value: string): Promise<void> {
    remember(value, true);
    await storageService.set(TOKEN_KEY, value);
  },

  async clearToken(): Promise<void> {
    remember(null, false);
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
