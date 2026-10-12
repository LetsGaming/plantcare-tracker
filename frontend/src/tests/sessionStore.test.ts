/**
 * Tests for the session store: token storage, local logout, the refresh flow
 * with its retry rules and single-flight behavior, and the identity getters
 * derived from the JWT.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { fakeJwt, jsonResponse, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);
vi.mock("@/stores/pinia", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/stores/pinia")>()),
  resetAllStores: vi.fn(),
}));
vi.mock("@/utils/apiUtils", () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(),
    configureAuth: vi.fn(),
    ensureFresh: vi.fn(async () => undefined),
  },
}));

import ApiUtils from "@/utils/apiUtils";
import TokenUtils from "@/utils/tokenUtils";
import storageService from "@/services/general/StorageService";
import { resetAllStores } from "@/stores/pinia";
import { epoch } from "@/stores/resource";
import { connectSessionToTransport, setLoginRedirect, useSessionStore } from "@/stores/session";
import type { AuthBridge } from "@/utils/apiUtils";

const redirect = vi.fn(async () => undefined);

beforeEach(() => {
  resetStore();
  TokenUtils.forget();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  setLoginRedirect(redirect);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("login and guest login", () => {
  it("posts credentials and stores the returned access token", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue({ accessToken: "jwt-1" });
    const session = useSessionStore();
    const res = await session.login({ username: "alice", password: "pw" });
    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/login", {
      username: "alice",
      password: "pw",
    });
    expect(res).toEqual({ accessToken: "jwt-1" });
    expect(memoryStore.get("authToken")).toBe("jwt-1");
    expect(session.token).toBe("jwt-1");
  });

  it("sends a null body on guest login", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue({ accessToken: "guest-jwt" });
    await useSessionStore().guestLogin();
    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/login/guest", null);
    expect(memoryStore.get("authToken")).toBe("guest-jwt");
  });

  it("does not store a token when login fails", async () => {
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("Invalid credentials"));
    const session = useSessionStore();
    await expect(session.login({ username: "a", password: "b" })).rejects.toThrow(
      "Invalid credentials",
    );
    expect(memoryStore.has("authToken")).toBe(false);
    expect(session.isAuthenticated).toBe(false);
  });
});

describe("logout and local logout", () => {
  it("notifies the server with a null body, then clears token and non-persistent storage", async () => {
    memoryStore.set("authToken", "jwt");
    memoryStore.set("plants_all", { data: [], timestamp: 1 });
    memoryStore.set("sales_data", { data: [], timestamp: 1, keepOnClear: true });
    vi.mocked(ApiUtils.post).mockResolvedValue(null);

    await useSessionStore().logout();

    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/logout", null);
    expect(memoryStore.has("authToken")).toBe(false);
    expect(memoryStore.has("plants_all")).toBe(false);
    expect(memoryStore.has("sales_data")).toBe(true);
  });

  it("still clears local state when the server call fails", async () => {
    memoryStore.set("authToken", "jwt");
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("offline"));
    await useSessionStore().logout();
    expect(memoryStore.has("authToken")).toBe(false);
  });

  it("empties the token in memory", async () => {
    const session = useSessionStore();
    await session.storeToken(fakeJwt({ id: 1, username: "a", role: "user" }));
    await session.localLogout();
    expect(session.token).toBeNull();
    expect(session.isAuthenticated).toBe(false);
  });

  it("hands over to the login redirect after cleaning up", async () => {
    await useSessionStore().localLogout();
    expect(redirect).toHaveBeenCalledOnce();
  });

  it("deleteProfile wipes all storage including persistent entries", async () => {
    memoryStore.set("sales_data", { data: [], keepOnClear: true });
    vi.mocked(ApiUtils.delete).mockResolvedValue(null);
    await useSessionStore().deleteProfile();
    expect(memoryStore.size).toBe(0);
    expect(redirect).toHaveBeenCalledOnce();
  });
});

describe("logout ordering", () => {
  it("ends the epoch, resets the stores, then clears storage", async () => {
    let epochAtReset = -1;
    const before = epoch.current();
    vi.mocked(resetAllStores).mockImplementation(() => {
      epochAtReset = epoch.current();
    });
    await useSessionStore().localLogout();
    expect(epochAtReset).toBe(before + 1);
    expect(vi.mocked(resetAllStores).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(storageService.clear).mock.invocationCallOrder[0],
    );
  });

  it("deleteProfile resets the stores before the full wipe", async () => {
    vi.mocked(ApiUtils.delete).mockResolvedValue(null);
    await useSessionStore().deleteProfile();
    expect(vi.mocked(resetAllStores).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(storageService.clearAll).mock.invocationCallOrder[0],
    );
  });

  it("deleteProfile drops the token from memory before the full wipe starts", async () => {
    await TokenUtils.setToken("jwt-doomed");
    vi.mocked(ApiUtils.delete).mockResolvedValue(null);
    const wipe = vi.mocked(storageService.clearAll).getMockImplementation();
    let tokenAtWipe: string | null | undefined;
    vi.mocked(storageService.clearAll).mockImplementationOnce(async () => {
      tokenAtWipe = TokenUtils.getTokenSync();
      await wipe?.();
    });
    await useSessionStore().deleteProfile();
    expect(tokenAtWipe).toBeNull();
  });

  it("keeps the token in memory only after a login until logout", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue({ accessToken: "jwt-mem" });
    await useSessionStore().login({ username: "a", password: "b" });
    expect(TokenUtils.getTokenSync()).toBe("jwt-mem");
    await useSessionStore().localLogout();
    expect(TokenUtils.getTokenSync()).toBeNull();
  });

  it("hydrates the token from storage once", async () => {
    memoryStore.set("authToken", "stored");
    const session = useSessionStore();
    await session.hydrate();
    expect(session.token).toBe("stored");
    expect(TokenUtils.getTokenSync()).toBe("stored");
    expect(storageService.get).toHaveBeenCalledTimes(1);
  });
});

describe("refresh", () => {
  it("stores and returns the new access token on success", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "fresh" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(useSessionStore().refresh()).resolves.toBe("fresh");
    expect(memoryStore.get("authToken")).toBe("fresh");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v2\/auth\/refresh-token$/);
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
  });

  it("stops after one attempt on 401 and rethrows without touching the session itself", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { error: { message: "no cookie" } }));
    vi.stubGlobal("fetch", fetchMock);
    memoryStore.set("authToken", "old");
    await expect(useSessionStore().refresh()).rejects.toThrow("Refresh token expired");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Teardown is the caller's job (the transport's auth bridge).
    expect(ApiUtils.post).not.toHaveBeenCalled();
    expect(memoryStore.get("authToken")).toBe("old");
  });

  it("retries three times, one second apart, on a server error and then rethrows", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(500, { error: { message: "Invalid refresh token" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = useSessionStore()
      .refresh()
      .catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(2500);
    const error = (await result) as Error;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error.message).toBe("Invalid refresh token");
  });

  it("rejects a success response without an access token after retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const result = useSessionStore()
      .refresh()
      .catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(2500);
    expect(((await result) as Error).message).toBe("Invalid response structure");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("shares one request between concurrent callers", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "fresh" } }));
    vi.stubGlobal("fetch", fetchMock);
    const session = useSessionStore();
    const results = await Promise.all([session.refresh(), session.refresh(), session.refresh()]);
    expect(results).toEqual(["fresh", "fresh", "fresh"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up on a refresh that hangs and aborts it on logout", async () => {
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const session = useSessionStore();
    const result = session.refresh().catch((e: Error) => e);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await session.localLogout();
    expect(signal?.aborted).toBe(true);
    expect(((await result) as Error).name).toBe("AbortError");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not store a token that arrives after logout", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const session = useSessionStore();
    const result = session.refresh().catch((e: Error) => e);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await session.localLogout();
    release(jsonResponse(200, { data: { accessToken: "late" } }));
    await result;
    expect(memoryStore.has("authToken")).toBe(false);
    expect(session.token).toBeNull();
  });

  it("never joins a refresh that started in an earlier epoch", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const session = useSessionStore();
    const first = session.refresh(1).catch((e: Error) => e);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    epoch.abortAll();
    const second = session.refresh(1).catch((e: Error) => e);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    epoch.abortAll();
    await Promise.all([first, second]);
  });

  it("starts a new request after the previous one has settled", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "fresh" } }));
    vi.stubGlobal("fetch", fetchMock);
    const session = useSessionStore();
    await session.refresh();
    await session.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("transport connection", () => {
  const connect = (): AuthBridge => {
    connectSessionToTransport(createPinia());
    return vi.mocked(ApiUtils.configureAuth).mock.calls.at(-1)![0] as AuthBridge;
  };

  it("passes the attempt count of the transport through to the refresh", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, { error: { message: "down" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(connect().refresh(1)).rejects.toThrow("down");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checks the token when the app becomes visible again or comes back online", () => {
    connect();
    const visibility = vi.spyOn(document, "visibilityState", "get");
    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ApiUtils.ensureFresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ApiUtils.ensureFresh).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    expect(ApiUtils.ensureFresh).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });
});

describe("identity getters", () => {
  const signInAs = async (payload: Record<string, unknown>) => {
    const session = useSessionStore();
    await session.storeToken(fakeJwt(payload));
    return session;
  };

  it("reads id, username and role from the token", async () => {
    const session = await signInAs({ id: 7, username: "alice", role: "admin" });
    expect(session.userId).toBe(7);
    expect(session.username).toBe("alice");
    expect(session.role).toBe("admin");
    expect(session.isAdmin).toBe(true);
    expect(session.isGuest).toBe(false);
  });

  it("recognizes a guest", async () => {
    const session = await signInAs({ id: 2, username: "guest", role: "guest" });
    expect(session.isGuest).toBe(true);
    expect(session.isAdmin).toBe(false);
  });

  it("falls back to empty values without a token", () => {
    const session = useSessionStore();
    expect(session.userId).toBe(-1);
    expect(session.username).toBe("");
    expect(session.role).toBeNull();
  });

  it("keeps user id 0 instead of treating it as missing", async () => {
    const session = await signInAs({ id: 0, username: "guest", role: "guest" });
    expect(session.userId).toBe(0);
  });

  it("decodes non-ASCII usernames", async () => {
    const session = await signInAs({ id: 1, username: "müller", role: "user" });
    expect(session.username).toBe("müller");
  });
});

describe("ensureAuthenticated", () => {
  it("is true without a network call when a token is stored", async () => {
    memoryStore.set("authToken", fakeJwt({ id: 1 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await useSessionStore().ensureAuthenticated()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries one refresh when no token is stored and reports false when it fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { error: { message: "no cookie" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await useSessionStore().ensureAuthenticated()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is true after a successful silent refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "silent" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await useSessionStore().ensureAuthenticated()).toBe(true);
  });
});
