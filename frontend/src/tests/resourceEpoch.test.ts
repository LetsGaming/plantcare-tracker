/**
 * The session epoch: work that started before a logout must neither be
 * applied to the stores nor written to storage, and the transport must not
 * touch storage per request.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defineStore } from "pinia";
import {
  cancelPendingPersistence,
  createInstalledPinia,
  fakeJwt,
  jsonResponse,
  memoryStore,
  resetStore,
} from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

import ApiUtils from "@/utils/apiUtils";
import TokenUtils from "@/utils/tokenUtils";
import storageService from "@/services/general/StorageService";
import { coalesced, epoch, requestScope } from "@/stores/resource";
import { useSessionStore } from "@/stores/session";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetStore();
  TokenUtils.forget();
  vi.clearAllMocks();
});

afterEach(() => {
  cancelPendingPersistence();
  vi.unstubAllGlobals();
});

describe("epoch", () => {
  it("counts epochs and reports older ones as stale", () => {
    const captured = epoch.current();
    expect(epoch.isStale(captured)).toBe(false);
    epoch.abortAll();
    expect(epoch.isStale(captured)).toBe(true);
    expect(epoch.current()).toBe(captured + 1);
  });

  it("aborts the signal handed out before and gives out a fresh one after", () => {
    const before = epoch.signal();
    epoch.abortAll();
    expect(before.aborted).toBe(true);
    expect(epoch.signal().aborted).toBe(false);
  });

  it("notifies listeners until they unsubscribe", () => {
    const listener = vi.fn();
    const off = epoch.onAbortAll(listener);
    epoch.abortAll();
    off();
    epoch.abortAll();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("coalesced", () => {
  it("shares the running work and hands it a live isCurrent", async () => {
    const owner = {};
    const gate = deferred<void>();
    const seen: boolean[] = [];
    const work = vi.fn(async (isCurrent: () => boolean) => {
      await gate.promise;
      seen.push(isCurrent());
    });
    const first = coalesced(owner, "k", work);
    const second = coalesced(owner, "k", work);
    gate.resolve();
    await Promise.all([first, second]);
    expect(work).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([true]);
  });

  it("reports isCurrent false once the epoch ended while the work ran", async () => {
    const gate = deferred<void>();
    let current: boolean | null = null;
    const running = coalesced({}, "k", async (isCurrent) => {
      await gate.promise;
      current = isCurrent();
    });
    epoch.abortAll();
    gate.resolve();
    await running;
    expect(current).toBe(false);
  });

  it("swallows the failure of work from an older epoch but not a current one", async () => {
    const stale = deferred<void>();
    const staleRun = coalesced({}, "k", () => stale.promise);
    epoch.abortAll();
    stale.reject(new Error("aborted late"));
    await expect(staleRun).resolves.toBeUndefined();

    await expect(
      coalesced({}, "k", async () => {
        throw new Error("real failure");
      }),
    ).rejects.toThrow("real failure");
  });

  it("does not hand stale work to a caller of the new epoch", async () => {
    const owner = {};
    const gate = deferred<void>();
    const old = vi.fn(() => gate.promise);
    const fresh = vi.fn(async () => undefined);
    void coalesced(owner, "k", old);
    epoch.abortAll();
    await coalesced(owner, "k", fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
    gate.resolve();
  });
});

describe("logout with a request in flight", () => {
  const useProbe = defineStore("epochProbe", {
    state: () => ({ items: [] as string[] }),
    persist: {
      entries: [
        {
          key: "epoch_probe",
          pick: (state) => state.items,
          apply: (state, data) => {
            state.items = data;
          },
          dirtyOn: ["load", "loadUnguarded"],
        },
      ],
      debounceMs: 0,
    },
    actions: {
      load() {
        return coalesced(this, "all", async (isCurrent) => {
          const response = await ApiUtils.get<string[]>("/probe");
          if (!isCurrent()) return;
          this.items = response;
        });
      },
      loadUnguarded() {
        return coalesced(this, "all", async () => {
          this.items = await ApiUtils.get<string[]>("/probe");
        });
      },
    },
  });

  const slowFetch = () => {
    const gate = deferred<Response>();
    const fetchMock = vi.fn(() => gate.promise);
    vi.stubGlobal("fetch", fetchMock);
    return { gate, fetchMock };
  };

  it.each(["load", "loadUnguarded"] as const)(
    "%s: the late result is neither applied nor persisted",
    async (action) => {
      await createInstalledPinia();
      const probe = useProbe();
      const session = useSessionStore();
      const { gate, fetchMock } = slowFetch();

      const running = probe[action]();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await session.localLogout();
      gate.resolve(jsonResponse(200, { data: ["previous-account-plant"] }));
      await running;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(probe.items).toEqual([]);
      expect(JSON.stringify([...memoryStore.values()])).not.toContain("previous-account-plant");
    },
  );

  it("aborts the request itself", async () => {
    await createInstalledPinia();
    const session = useSessionStore();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    void ApiUtils.get("/probe").catch(() => undefined);
    await vi.waitFor(() => expect(signal).toBeDefined());
    await session.localLogout();
    expect(signal?.aborted).toBe(true);
  });
});

describe("token handling in the transport", () => {
  it("reads storage at most once for five requests, and not at all after a login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { data: [] })),
    );
    memoryStore.set("authToken", fakeJwt({ id: 1, exp: Math.floor(Date.now() / 1000) + 900 }));

    for (let i = 0; i < 5; i++) await ApiUtils.get("/plants");
    expect(storageService.get).toHaveBeenCalledTimes(1);

    vi.mocked(storageService.get).mockClear();
    await TokenUtils.setToken(fakeJwt({ id: 2, exp: Math.floor(Date.now() / 1000) + 900 }));
    for (let i = 0; i < 5; i++) await ApiUtils.get("/plants");
    expect(storageService.get).not.toHaveBeenCalled();
  });

  it("sends the in-memory token and drops it on clear", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await TokenUtils.setToken("memory-jwt");
    await ApiUtils.get("/plants");
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
      .headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer memory-jwt");
    await TokenUtils.clearToken();
    expect(TokenUtils.getTokenSync()).toBeNull();
  });

  it("decodes the expiry once per token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { data: [] })),
    );
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = fakeJwt({ exp });
    const atob = vi.spyOn(globalThis, "atob");
    await TokenUtils.setToken(token);
    for (let i = 0; i < 5; i++) {
      await ApiUtils.get("/plants");
      expect(TokenUtils.expiresAt()).toBe(exp * 1000);
    }
    expect(atob).toHaveBeenCalledTimes(1);
    await TokenUtils.setToken("not-a-jwt");
    expect(TokenUtils.expiresAt()).toBeNull();
    atob.mockRestore();
  });

  it("anchors a received token's expiry to the local clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2030-01-01T00:00:00Z"));
    // The server clock is an hour behind: exp alone would read as long expired.
    const iat = Math.floor(Date.now() / 1000) - 3600;
    const token = fakeJwt({ iat, exp: iat + 900 });
    await TokenUtils.setToken(token);
    expect(TokenUtils.expiresAt()).toBe(Date.now() + 900_000);
    TokenUtils.forget();
    await TokenUtils.load();
    expect(TokenUtils.expiresAt()).toBe((iat + 900) * 1000);
    vi.useRealTimers();
  });
});

describe("requestScope", () => {
  it("does not report a timeout when the caller aborted first", async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const scope = requestScope(1_000, caller.signal);
    caller.abort();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(scope.signal.aborted).toBe(true);
    expect(scope.timedOut).toBe(false);
    scope.dispose();
    vi.useRealTimers();
  });
});
