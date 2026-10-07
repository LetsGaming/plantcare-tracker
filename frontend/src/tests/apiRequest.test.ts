/**
 * Characterization tests for the ApiUtils request engine: headers, body
 * serialization (including the JSON null body behind BUG-01), the refresh
 * gate for 401 and 403, and the SSE ticket handshake.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "./helpers";

vi.mock("@/services/general/ToastService", () => ({
  default: { showError: vi.fn(), showSuccess: vi.fn() },
}));
vi.mock("@/services/general/LocalizationService", () => ({
  default: { t: (_k: string, _v?: unknown, fallback?: string) => fallback ?? _k },
}));
vi.mock("../utils/tokenUtils", () => ({ default: { getToken: vi.fn() } }));
vi.mock("../utils/utils", () => ({ default: { getApiBaseUrl: () => "http://test/api/v2" } }));
vi.mock("@/services/UserService", () => ({
  default: { refreshToken: vi.fn(), logout: vi.fn(), handleLocalLogout: vi.fn() },
}));

import ApiUtils from "../utils/apiUtils";
import TokenUtils from "../utils/tokenUtils";
import UserService from "@/services/UserService";
import ToastService from "@/services/general/ToastService";

const lastCall = (fetchMock: ReturnType<typeof vi.fn>, index = -1) => {
  const call = fetchMock.mock.calls.at(index)!;
  return { url: String(call[0]), init: call[1] as RequestInit };
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(TokenUtils.getToken).mockResolvedValue(null);
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
    vi.mocked(TokenUtils.getToken).mockResolvedValue("jwt");
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
    vi.mocked(TokenUtils.getToken).mockResolvedValue("stored");
    vi.mocked(UserService.refreshToken).mockResolvedValue("fresh" as never);
  });

  it("refreshes and retries once on a 403 as well as on a 401", async () => {
    fetchMock
      .mockImplementationOnce(async () =>
        jsonResponse(403, { error: { message: "Invalid or expired token" } }),
      )
      .mockImplementationOnce(async () => jsonResponse(200, { data: [1] }));
    await expect(ApiUtils.get("/plants")).resolves.toEqual([1]);
    expect(UserService.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns the second 403 as an error without another refresh", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(403, { error: { message: "Forbidden" } }),
    );
    await expect(ApiUtils.get("/plants")).rejects.toMatchObject({ status: 403 });
    expect(UserService.refreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tears down locally and shows one toast when the refresh itself fails", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "expired" } }));
    vi.mocked(UserService.refreshToken).mockRejectedValue(new Error("Refresh token expired"));
    await expect(ApiUtils.get("/plants")).rejects.toThrow("Session expired. Please log in again.");
    expect(UserService.handleLocalLogout).toHaveBeenCalledTimes(1);
    expect(ToastService.showError).toHaveBeenCalledTimes(1);
  });

  it.each(["/auth/login", "/auth/refresh-token", "/auth/logout"])(
    "never refreshes for %s",
    async (endpoint) => {
      fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "no" } }));
      await expect(ApiUtils.post(endpoint, {})).rejects.toMatchObject({ status: 401 });
      expect(UserService.refreshToken).not.toHaveBeenCalled();
    },
  );

  it("starts one refresh per failing request when several fail at once", async () => {
    fetchMock.mockImplementation(async () => jsonResponse(401, { error: { message: "expired" } }));
    vi.mocked(UserService.refreshToken).mockRejectedValue(new Error("expired"));
    await Promise.allSettled([ApiUtils.get("/a"), ApiUtils.get("/b"), ApiUtils.get("/c")]);
    expect(UserService.refreshToken).toHaveBeenCalledTimes(3);
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
    vi.mocked(TokenUtils.getToken).mockResolvedValue("jwt");
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
