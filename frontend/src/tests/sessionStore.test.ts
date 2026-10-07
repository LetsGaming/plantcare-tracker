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
vi.mock("@/utils/apiUtils", () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn(), configureAuth: vi.fn() },
}));

import ApiUtils from "@/utils/apiUtils";
import { BaseService } from "@/services/base/BaseService";
import { setLoginRedirect, useSessionStore } from "@/stores/session";

const redirect = vi.fn(async () => undefined);

beforeEach(() => {
  resetStore();
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

  it("empties the token in memory and the legacy memory cache", async () => {
    const clear = vi.spyOn(BaseService, "clearMemoryCache");
    const session = useSessionStore();
    await session.storeToken(fakeJwt({ id: 1, username: "a", role: "user" }));
    await session.localLogout();
    expect(clear).toHaveBeenCalledOnce();
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
