/**
 * Characterization tests for UserService: token storage, local logout,
 * the refresh flow with its retry rules, and JWT-derived identity getters.
 * Pins current behavior, including the rough edges listed in the audit
 * (BUG-01 null bodies, BUG-05 retry on 403, UTF-8 usernames).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fakeJwt, jsonResponse, memoryStore, resetStore } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

const router = vi.hoisted(() => ({
  currentRoute: { value: { name: "plant-overview" as string | undefined } },
  replace: vi.fn(async () => undefined),
}));
vi.mock("@/router", () => ({ default: router }));

vi.mock("@/utils/apiUtils", () => ({
  default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), get: vi.fn() },
}));

import ApiUtils from "@/utils/apiUtils";
import UserService from "@/services/UserService";
import { BaseService } from "@/services/base/BaseService";

const reload = vi.fn();

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  router.currentRoute.value.name = "plant-overview";
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("login and guest login", () => {
  it("posts credentials and stores the returned access token", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue({ accessToken: "jwt-1" });
    const res = await UserService.login({ username: "alice", password: "pw" });
    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/login", {
      username: "alice",
      password: "pw",
    });
    expect(res).toEqual({ accessToken: "jwt-1" });
    expect(memoryStore.get("authToken")).toBe("jwt-1");
  });

  it("sends a null body on guest login", async () => {
    vi.mocked(ApiUtils.post).mockResolvedValue({ accessToken: "guest-jwt" });
    await UserService.guestLogin();
    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/login/guest", null);
    expect(memoryStore.get("authToken")).toBe("guest-jwt");
  });

  it("does not store a token when login fails", async () => {
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("Invalid credentials"));
    await expect(UserService.login({ username: "a", password: "b" })).rejects.toThrow(
      "Invalid credentials",
    );
    expect(memoryStore.has("authToken")).toBe(false);
  });
});

describe("logout and local logout", () => {
  it("notifies the server with a null body, then clears token and non-persistent storage", async () => {
    memoryStore.set("authToken", "jwt");
    memoryStore.set("plants_all", { data: [], timestamp: 1 });
    memoryStore.set("sales_data", { data: [], timestamp: 1, keepOnClear: true });
    vi.mocked(ApiUtils.post).mockResolvedValue(null);

    await UserService.logout();

    expect(ApiUtils.post).toHaveBeenCalledWith("/auth/logout", null);
    expect(memoryStore.has("authToken")).toBe(false);
    expect(memoryStore.has("plants_all")).toBe(false);
    expect(memoryStore.has("sales_data")).toBe(true);
  });

  it("still clears local state when the server call fails", async () => {
    memoryStore.set("authToken", "jwt");
    vi.mocked(ApiUtils.post).mockRejectedValue(new Error("offline"));
    await UserService.logout();
    expect(memoryStore.has("authToken")).toBe(false);
  });

  it("drops the in-memory cache so the next account cannot read the previous one", async () => {
    const clear = vi.spyOn(BaseService, "clearMemoryCache");
    await UserService.handleLocalLogout();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("redirects to login and reloads the page when signed in", async () => {
    await UserService.handleLocalLogout();
    expect(router.replace).toHaveBeenCalledWith({ name: "login" });
    await Promise.resolve();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not navigate or reload when already on the login screen", async () => {
    router.currentRoute.value.name = "login";
    await UserService.handleLocalLogout();
    expect(router.replace).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("deleteProfile wipes all storage including persistent entries", async () => {
    memoryStore.set("sales_data", { data: [], keepOnClear: true });
    vi.mocked(ApiUtils.delete).mockResolvedValue(null);
    await UserService.deleteProfile();
    expect(memoryStore.size).toBe(0);
  });
});

describe("refreshToken", () => {
  it("stores and returns the new access token on success", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "fresh" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(UserService.refreshToken()).resolves.toBe("fresh");
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
    await expect(UserService.refreshToken()).rejects.toThrow("Refresh token expired");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Teardown is the caller's job (ApiUtils.handleNoAuth); the stored token survives here.
    expect(ApiUtils.post).not.toHaveBeenCalled();
    expect(memoryStore.get("authToken")).toBe("old");
  });

  it("retries three times, one second apart, on 403 and then rethrows", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse(403, { error: { message: "Invalid refresh token" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = UserService.refreshToken().catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(2500);
    const error = (await result) as Error;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(error.message).toBe("Invalid refresh token");
    expect(ApiUtils.post).not.toHaveBeenCalled();
  });

  it("rejects a success response without an access token after retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const result = UserService.refreshToken().catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(2500);
    expect(((await result) as Error).message).toBe("Invalid response structure");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("identity getters", () => {
  const withToken = (payload: Record<string, unknown>) => {
    memoryStore.set("authToken", fakeJwt(payload));
  };

  it("reads id, username and role from the stored JWT", async () => {
    withToken({ id: 7, username: "alice", role: "admin" });
    expect(await UserService.getUserId()).toBe(7);
    expect(await UserService.getUsername()).toBe("alice");
    expect(await UserService.getUserRole()).toBe("admin");
    expect(await UserService.isAdmin()).toBe(true);
    expect(await UserService.isGuest()).toBe(false);
  });

  it("recognizes a guest", async () => {
    withToken({ id: 2, username: "guest", role: "guest" });
    expect(await UserService.isGuest()).toBe(true);
    expect(await UserService.isAdmin()).toBe(false);
  });

  it("falls back to empty values without a token", async () => {
    expect(await UserService.getUserId()).toBe(-1);
    expect(await UserService.getUsername()).toBe("");
    expect(await UserService.getUserRole()).toBeNull();
  });

  it("returns -1 for the user id 0 because it is falsy", async () => {
    withToken({ id: 0, username: "guest", role: "guest" });
    expect(await UserService.getUserId()).toBe(-1);
  });

  it("mis-decodes non-ASCII usernames because the payload is read with atob", async () => {
    withToken({ id: 1, username: "müller", role: "user" });
    expect(await UserService.getUsername()).not.toBe("müller");
  });
});

describe("isAuthenticated", () => {
  it("is true without a network call when a token is stored", async () => {
    memoryStore.set("authToken", fakeJwt({ id: 1 }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await UserService.isAuthenticated()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries one refresh when no token is stored and reports false when it fails", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(401, { error: { message: "no cookie" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await UserService.isAuthenticated()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is true after a successful silent refresh", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => jsonResponse(200, { data: { accessToken: "silent" } }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await UserService.isAuthenticated()).toBe(true);
  });
});
