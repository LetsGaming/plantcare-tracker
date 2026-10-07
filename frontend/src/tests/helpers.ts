import { vi } from "vitest";

/** In-memory stand-in for the Ionic storage backing StorageService. */
export const memoryStore = new Map<string, unknown>();

export const storageModule = () => ({
  default: {
    get: vi.fn(async (key: string) => memoryStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      memoryStore.set(key, value);
    }),
    remove: vi.fn(async (key: string) => {
      memoryStore.delete(key);
    }),
    clear: vi.fn(async () => {
      for (const [key, value] of [...memoryStore]) {
        if (!(value as { keepOnClear?: boolean } | null)?.keepOnClear) memoryStore.delete(key);
      }
    }),
    clearAll: vi.fn(async () => {
      memoryStore.clear();
    }),
  },
});

export const toast = {
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  addToast: vi.fn(),
};

export const toastModule = () => ({ default: toast });

export const localizationModule = () => ({
  default: {
    t: (key: string, _vars?: unknown, fallback?: string) => fallback ?? key,
    getLocale: () => "en",
    locale: { value: "en" },
  },
});

export const jsonResponse = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Builds an unsigned JWT-shaped string; payload is encoded as UTF-8 base64url. */
export const fakeJwt = (payload: Record<string, unknown>): string => {
  const encode = (value: unknown) => {
    let binary = "";
    new TextEncoder().encode(JSON.stringify(value)).forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary).split("+").join("-").split("/").join("_").split("=").join("");
  };
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.signature`;
};

export const resetStore = () => {
  memoryStore.clear();
};
