/**
 * Characterization tests for the ApiUtils request engine: headers, body
 * serialization (including the JSON null body behind BUG-01), the refresh
 * gate for 401, and the SSE ticket handshake.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "./helpers";

vi.mock("@/services/general/ToastService", () => ({
  default: { showError: vi.fn(), showSuccess: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (_k: string, _v?: unknown, fallback?: string) => fallback ?? _k },
}));
vi.mock("../utils/tokenUtils", () => ({
  default: {
    getTokenSync: vi.fn(() => null),
    isLoaded: vi.fn(() => true),
    load: vi.fn(async () => null),
    expiresAt: vi.fn(() => null),
  },
}));
vi.mock("../utils/utils", () => ({ default: { getApiBaseUrl: () => "http://test/api/v2" } }));

import ApiUtils, { isNotModified } from "../utils/apiUtils";
import { epoch } from "@/stores/resource";
import TokenUtils from "../utils/tokenUtils";
import ToastService from "@/services/general/ToastService";

const bridge = { refresh: vi.fn(), onAuthFailure: vi.fn() };

const lastCall = (fetchMock: ReturnType<typeof vi.fn>, index = -1) => {
  const call = fetchMock.mock.calls.at(index)!;
  return { url: String(call[0]), init: call[1] as RequestInit };
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  ApiUtils.configureAuth(bridge);
  vi.mocked(TokenUtils.getTokenSync).mockReturnValue(null);
  vi.mocked(TokenUtils.expiresAt).mockReturnValue(null);
  fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, { data: { ok: true } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("prefixes the base URL, includes credentials and sends no auth header without a token", async () => {
    await ApiUtils.get("/plants");
    const { url, init } = lastCall(fetchMock);
    expect(url).toBe("http://test/api/v2/plants");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBeUndefined();
  });

  it("sends the stored token as a bearer header", async () => {
    vi.mocked(TokenUtils.getTokenSync).mockReturnValue("jwt");
    await ApiUtils.get("/plants");
    expect((lastCall(fetchMock).init.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt",
    );
  });

  it("serializes a JSON body", async () => {
    await ApiUtils.post("/plants", { name: "x" });
    expect(lastCall(fetchMock).init.body).toBe('{"name":"x"}');
  });

  it("serializes a null body as the JSON text null (BUG-01)", async () => {
    await ApiUtils.post("/auth/logout", null);
    const { init } = lastCall(fetchMock);
    expect(init.body).toBe("null");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("sends no body for an omitted payload but still declares JSON", async () => {
    await ApiUtils.post("/auth/ticket");
    const { init } = lastCall(fetchMock);
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("leaves the content type to the browser for uploads", async () => {
    const form = new FormData();
    form.append("image", new Blob(["x"]), "x.png");
    await ApiUtils.upload("/images/plant/1", form);
    const { init } = lastCall(fetchMock);
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({});
    expect(init.method).toBe("POST");
  });

  it("appends query parameters", async () => {
    await ApiUtils.getWithParams("/images/plant", { entityId: "3" });
    expect(lastCall(fetchMock).url).toBe("http://test/api/v2/images/plant?entityId=3");
  });
});

describe("refresh gate", () => {
  beforeEach(() => {
    vi.mocked(TokenUtils.getTokenSync).mockReturnValue("stored");
    vi.mocked(bridge.refresh).mockResolvedValue("fresh" as never);
  });

  it("refreshes and retries once on a 401", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        jsonResponse(401, { error: { message: "Invalid or expired token" } }),
      )
      .mockImplementationOnce(async () => jsonResponse(200, { data: [1] }));
    await expect(ApiUtils.get("/plants")).resolves.toEqual([1]);
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not refresh on a 403 and surfaces it as an error", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(403, { error: { message: "Forbidden" } }),
    );
    await expect(ApiUtils.get("/plants")).rejects.toMatchObject({ status: 403 });
    expect(bridge.refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns the second 401 as an error without another refresh", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(401, { error: { message: "Invalid or expired token" } }),
    );
    await expect(ApiUtils.get("/plants")).rejects.toMatchObject({ status: 401 });
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tears down locally and shows one toast when the refresh itself fails", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "expired" } }));
    vi.mocked(bridge.refresh).mockRejectedValue(new Error("Refresh token expired"));
    await expect(ApiUtils.get("/plants")).rejects.toThrow("Session expired. Please log in again.");
    expect(bridge.onAuthFailure).toHaveBeenCalledTimes(1);
    expect(ToastService.showError).toHaveBeenCalledTimes(1);
  });

  it.each(["/auth/login", "/auth/refresh-token", "/auth/logout"])(
    "never refreshes for %s",
    async (endpoint) => {
      fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "no" } }));
      await expect(ApiUtils.post(endpoint, {})).rejects.toMatchObject({ status: 401 });
      expect(bridge.refresh).not.toHaveBeenCalled();
    },
  );

  it("starts one refresh per failing request when several fail at once", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "expired" } }));
    vi.mocked(bridge.refresh).mockRejectedValue(new Error("expired"));
    await Promise.allSettled([ApiUtils.get("/a"), ApiUtils.get("/b"), ApiUtils.get("/c")]);
    expect(bridge.refresh).toHaveBeenCalledTimes(3);
  });
});

describe("stream", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    readyState = 1;
    CLOSED = 2;
    onmessage: ((e: MessageEvent) => void) | null = null;
    listeners = new Map<string, (e: Event) => void>();
    constructor(
      public url: string,
      public init?: EventSourceInit,
    ) {
      FakeEventSource.instances.push(this);
    }
    addEventListener(type: string, fn: (e: Event) => void) {
      this.listeners.set(type, fn);
    }
    close() {
      this.readyState = 2;
    }
  }

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    vi.mocked(TokenUtils.getTokenSync).mockReturnValue("jwt");
  });

  it("fetches a one-time ticket and opens the stream with credentials", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t1" } }));
    await ApiUtils.stream("/sales", vi.fn());
    expect(lastCall(fetchMock).url).toBe("http://test/api/v2/auth/ticket");
    const source = FakeEventSource.instances[0];
    expect(source.url).toBe("http://test/api/v2/sales?ticket=t1");
    expect(source.init).toEqual({ withCredentials: true });
  });

  it("appends the ticket to an existing query string", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t 1" } }));
    await ApiUtils.stream("/more-info?plantName=Aloe", vi.fn());
    expect(FakeEventSource.instances[0].url).toBe(
      "http://test/api/v2/more-info?plantName=Aloe&ticket=t%201",
    );
  });

  it("parses message events, reports done and closes the source", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t" } }));
    const onMessage = vi.fn();
    const onDone = vi.fn();
    await ApiUtils.stream("/sales", onMessage, undefined, onDone);
    const source = FakeEventSource.instances[0];
    source.onmessage?.({ data: JSON.stringify([{ id: 1 }]) } as MessageEvent);
    source.listeners.get("done")?.({ data: JSON.stringify({ total: 1 }) } as MessageEvent);
    expect(onMessage).toHaveBeenCalledWith({ data: [{ id: 1 }] });
    expect(onDone).toHaveBeenCalledWith({ total: 1 });
    expect(source.readyState).toBe(2);
  });

  it("reports a server error event payload and closes", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t" } }));
    const onError = vi.fn();
    await ApiUtils.stream("/sales", vi.fn(), onError);
    const source = FakeEventSource.instances[0];
    const event = new MessageEvent("error", {
      data: JSON.stringify({ message: "Stream interrupted" }),
    });
    source.listeners.get("error")?.(event);
    expect(onError).toHaveBeenCalledWith({ message: "Stream interrupted" });
    expect(source.readyState).toBe(2);
  });

  it("reports ticket failures through onError and returns a no-op cleanup", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(500, { error: { message: "boom" } }));
    const onError = vi.fn();
    const cleanup = await ApiUtils.stream("/sales", vi.fn(), onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(FakeEventSource.instances).toHaveLength(0);
    expect(() => cleanup()).not.toThrow();
  });
});

const hangingFetch = () =>
  vi.fn().mockImplementation(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );

const ifNoneMatch = (mock: ReturnType<typeof vi.fn>) =>
  (lastCall(mock).init.headers as Record<string, string>)["If-None-Match"];

describe("timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["GET", 20_000, () => ApiUtils.get("/plants")],
    ["write", 30_000, () => ApiUtils.post("/plants", { a: 1 })],
    ["upload", 120_000, () => ApiUtils.upload("/images/plant/1", new FormData())],
  ])("ends a hung %s after %i ms with the network error path", async (_name, ms, call) => {
    vi.stubGlobal("fetch", hangingFetch());
    let settled = false;
    const result = (call() as Promise<unknown>).catch((e: unknown) => {
      settled = true;
      return e;
    });
    await vi.advanceTimersByTimeAsync(ms - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const error = await result;
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("No connection. Check your network and try again.");
  });

  it("rethrows the caller's own abort untouched", async () => {
    vi.stubGlobal("fetch", hangingFetch());
    const controller = new AbortController();
    const result = ApiUtils.get("/plants", controller.signal).catch((e: unknown) => e);
    controller.abort();
    const error = await result;
    expect(error).toMatchObject({ name: "AbortError" });
    expect(error).not.toBeInstanceOf(TypeError);
  });

  it("does not log the user out when the retry after a refresh times out", async () => {
    vi.mocked(TokenUtils.getTokenSync).mockReturnValue("stored");
    vi.mocked(bridge.refresh).mockResolvedValue("fresh" as never);
    const hanging = hangingFetch();
    fetchMock
      .mockImplementationOnce(async () => jsonResponse(401, { error: { message: "expired" } }))
      .mockImplementationOnce(hanging);
    const result = ApiUtils.get("/plants").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_001);
    expect(await result).toBeInstanceOf(TypeError);
    expect(bridge.onAuthFailure).not.toHaveBeenCalled();
  });

  it("stops a stream that stays silent for 60 s", async () => {
    class SilentSource {
      static last: SilentSource;
      readyState = 1;
      CLOSED = 2;
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        SilentSource.last = this;
      }
      addEventListener() {}
      close() {
        this.readyState = 2;
      }
    }
    vi.stubGlobal("EventSource", SilentSource);
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t" } }));
    const onError = vi.fn();
    await ApiUtils.stream("/sales", vi.fn(), onError);
    await vi.advanceTimersByTimeAsync(59_000);
    SilentSource.last.onmessage?.({ data: "[]" } as MessageEvent);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(onError).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(TypeError);
    expect(SilentSource.last.readyState).toBe(2);
  });
});

let clock = Date.parse("2030-01-01T00:00:00Z");

describe("proactive refresh", () => {
  beforeEach(() => {
    clock += 60_000;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(clock);
    vi.mocked(TokenUtils.getTokenSync).mockReturnValue("stored");
    vi.mocked(bridge.refresh).mockResolvedValue("fresh" as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts one shared refresh for concurrent requests when under 60 s remain", async () => {
    vi.mocked(TokenUtils.expiresAt).mockReturnValue(Date.now() + 30_000);
    await Promise.all([ApiUtils.get("/a"), ApiUtils.get("/b"), ApiUtils.post("/c", {})]);
    expect(bridge.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("refreshes before the request is sent", async () => {
    vi.mocked(TokenUtils.expiresAt).mockReturnValue(Date.now() + 1_000);
    const order: string[] = [];
    vi.mocked(bridge.refresh).mockImplementation(async () => {
      order.push("refresh");
      return "fresh";
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return jsonResponse(200, { data: 1 });
    });
    await ApiUtils.get("/a");
    expect(order).toEqual(["refresh", "fetch"]);
  });

  it("leaves a token with plenty of time alone", async () => {
    vi.mocked(TokenUtils.expiresAt).mockReturnValue(Date.now() + 10 * 60_000);
    await ApiUtils.get("/a");
    expect(bridge.refresh).not.toHaveBeenCalled();
  });

  it("still sends the request when the proactive refresh fails", async () => {
    vi.mocked(TokenUtils.expiresAt).mockReturnValue(Date.now() + 1_000);
    vi.mocked(bridge.refresh).mockRejectedValue(new Error("offline"));
    await expect(ApiUtils.get("/a")).resolves.toEqual({ ok: true });
  });

  it("does not refresh for auth endpoints", async () => {
    vi.mocked(TokenUtils.expiresAt).mockReturnValue(Date.now() + 1_000);
    await ApiUtils.post("/auth/logout", null);
    expect(bridge.refresh).not.toHaveBeenCalled();
  });
});

describe("conditional requests", () => {
  const okWithEtag = (etag: string) => {
    const response = jsonResponse(200, { data: [1] });
    response.headers.set("ETag", etag);
    return response;
  };

  it("sends If-None-Match from the previous response and resolves notModified on 304", async () => {
    fetchMock
      .mockImplementationOnce(async () => okWithEtag('"v1"'))
      .mockImplementationOnce(async () => new Response(null, { status: 304 }));
    await expect(ApiUtils.get("/etag-a", undefined, { conditional: true })).resolves.toEqual([1]);
    expect(ifNoneMatch(fetchMock)).toBeUndefined();
    const second = await ApiUtils.get("/etag-a", undefined, { conditional: true });
    expect(isNotModified(second)).toBe(true);
    expect(ifNoneMatch(fetchMock)).toBe('"v1"');
  });

  it("never sends If-None-Match for a plain GET", async () => {
    fetchMock.mockImplementation(async () => okWithEtag('"v9"'));
    await ApiUtils.get("/etag-b", undefined, { conditional: true });
    await ApiUtils.get("/etag-b");
    expect(ifNoneMatch(fetchMock)).toBeUndefined();
  });

  it("forgets every ETag when the session epoch ends", async () => {
    fetchMock.mockImplementation(async () => okWithEtag('"v2"'));
    await ApiUtils.get("/etag-c", undefined, { conditional: true });
    epoch.abortAll();
    await ApiUtils.get("/etag-c", undefined, { conditional: true });
    expect(ifNoneMatch(fetchMock)).toBeUndefined();
  });

  it("keeps at most 200 ETags, dropping the least recently used", async () => {
    fetchMock.mockImplementation(async () => okWithEtag('"x"'));
    for (let i = 0; i < 201; i++) {
      await ApiUtils.get(`/many/${i}`, undefined, { conditional: true });
    }
    await ApiUtils.get("/many/0", undefined, { conditional: true });
    expect(ifNoneMatch(fetchMock)).toBeUndefined();
    await ApiUtils.get("/many/200", undefined, { conditional: true });
    expect(ifNoneMatch(fetchMock)).toBe('"x"');
  });
});

describe("logout epoch", () => {
  it("aborts in-flight requests and never delivers a late result", async () => {
    let release: (r: Response) => void = () => {};
    const slow = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal("fetch", slow);
    const pending = ApiUtils.get("/plants").catch((e: unknown) => e);
    await vi.waitFor(() => expect(slow).toHaveBeenCalled());
    epoch.abortAll();
    release(jsonResponse(200, { data: ["late"] }));
    expect(await pending).toMatchObject({ name: "AbortError" });
  });

  it("closes an open stream without reporting an error", async () => {
    class Source {
      static last: Source;
      readyState = 1;
      CLOSED = 2;
      onmessage = null;
      constructor() {
        Source.last = this;
      }
      addEventListener() {}
      close() {
        this.readyState = 2;
      }
    }
    vi.stubGlobal("EventSource", Source);
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: { ticket: "t" } }));
    const onError = vi.fn();
    await ApiUtils.stream("/sales", vi.fn(), onError);
    epoch.abortAll();
    expect(Source.last.readyState).toBe(2);
    expect(onError).not.toHaveBeenCalled();
  });
});
