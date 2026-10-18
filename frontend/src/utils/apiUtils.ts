import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import TokenUtils from "./tokenUtils";
import Utils from "./utils";
import { epoch, requestScope, type RequestScope } from "./epoch";

/** Pre-computed API URL to eliminate repeated string concatenation logic */
const API_BASE_URL = Utils.getApiBaseUrl();

const GET_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const STREAM_IDLE_TIMEOUT_MS = 60_000;
const REFRESH_MARGIN_MS = 60_000;
const PROACTIVE_REFRESH_SPACING_MS = 10_000;
const ETAG_CAPACITY = 200;

/** Result of a conditional GET whose ETag still matches: keep the data you have. */
export interface NotModified {
  readonly notModified: true;
}

const NOT_MODIFIED: NotModified = Object.freeze({ notModified: true as const });

export interface GetOptions {
  /**
   * Sends If-None-Match from the last response for this exact URL (path plus
   * query) and resolves `NotModified` on 304. Opt in only when the caller
   * keeps its own copy of the last 200 body for that URL: the transport stores
   * the ETag, never the body.
   */
  conditional?: boolean;
}

/** Last ETag per URL, least recently used first. */
const etags = new Map<string, string>();

const rememberEtag = (url: string, etag: string): void => {
  etags.delete(url);
  etags.set(url, etag);
  if (etags.size > ETAG_CAPACITY) etags.delete(etags.keys().next().value as string);
};

epoch.onAbortAll(() => etags.clear());

const abortError = (): DOMException => new DOMException("The request was aborted.", "AbortError");

/** Settles like `promise`, or rejects with an AbortError as soon as `signal` aborts. */
const untilAborted = <T>(promise: Promise<T>, signal: AbortSignal): Promise<T> => {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
};

const timeoutError = (): TypeError =>
  new TypeError(
    localizationService.t(
      "toast2.network",
      undefined,
      "No connection. Check your network and try again.",
    ),
  );

// ── ApiError ──────────────────────────────────────────────────────────────────

/**
 * Custom Error class for API-level failures.
 * Extends the native Error to include HTTP status codes, the V2 error type,
 * and optional per-field validation details.
 */
class ApiError extends Error {
  /** V2 error type discriminator e.g. 'ValidationError', 'NotFoundError' */
  public readonly errorType?: string;
  /** Per-field validation errors from V2 ValidationError (400) responses */
  public readonly fields?: Record<string, string>;

  constructor(
    public status: number,
    public data: any,
    message?: string,
  ) {
    const errorObj = data?.error ?? null;
    const finalMessage = message || errorObj?.message || data?.message || "API error";

    super(finalMessage);
    this.name = "ApiError";
    this.errorType = errorObj?.type;
    this.fields = errorObj?.fields;

    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, ApiError);
    }
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  toString(): string {
    return `${this.name} (${this.status}): ${this.message}`;
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      errorType: this.errorType,
      message: this.message,
      fields: this.fields,
      data: this.data,
      stack: this.stack,
    };
  }
}

// ── Response handler ──────────────────────────────────────────────────────────

const NO_REFRESH_ENDPOINTS = ["/auth/refresh-token", "/auth/login", "/auth/logout"];

/**
 * Processes the raw Fetch Response into a typed data object.
 * Supports both the V2 envelope { success, data } / { error: { type, message } }
 * and the legacy V1 shape { error: string, message: string }.
 */
const handleResponse = async (response: Response, signal?: AbortSignal): Promise<any> => {
  // 204 No Content: no body, just signal success
  if (response.status === 204) return null;

  // Read the body exactly once to avoid consuming the stream twice
  let rawText: string;
  try {
    rawText = await response.text();
  } catch {
    if (signal?.aborted) throw signal.reason ?? abortError();
    rawText = "";
  }

  let responseData: any;
  try {
    responseData = JSON.parse(rawText);
  } catch {
    throw new ApiError(
      response.status,
      { message: rawText },
      rawText || "Failed to parse response.",
    );
  }

  // Success path: HTTP 2xx. Return .data if present, else the full body.
  // Guard against null / primitive JSON bodies before using the `in` operator.
  if (response.ok) {
    if (responseData && typeof responseData === "object" && !Array.isArray(responseData)) {
      return "data" in responseData ? responseData.data : responseData;
    }
    return responseData ?? null;
  }

  // Error path: extract the best human-readable message.
  // Handles V2 { error: { message } }, V1 { error: "string" }, and { message }.
  const errObj =
    responseData.error && typeof responseData.error === "object" ? responseData.error : null;
  const message =
    errObj?.message ||
    (typeof responseData.error === "string" ? responseData.error : undefined) ||
    responseData.message ||
    `Error: ${response.status}`;

  throw new ApiError(response.status, responseData, message);
};

// ── Headers ───────────────────────────────────────────────────────────────────

const getHeaders = (isFileUpload: boolean = false): Record<string, string> => {
  const token = TokenUtils.getTokenSync();
  const headers: Record<string, string> = {};

  if (!isFileUpload) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
};

// ── Auth retry ────────────────────────────────────────────────────────────────

/** What the transport needs from the session; registered once at startup. */
export interface AuthBridge {
  /** Gets a new access token in up to `retryCount` attempts; rejects when the session cannot be renewed. */
  refresh(retryCount?: number): Promise<unknown>;
  /** Tears the local session down after a failed refresh. */
  onAuthFailure(): Promise<void>;
}

let authBridge: AuthBridge | null = null;

const requireAuthBridge = (): AuthBridge => {
  if (!authBridge) throw new Error("ApiUtils: no auth bridge configured");
  return authBridge;
};

let freshInflight: Promise<void> | null = null;
let lastProactiveRefreshAt = 0;

/**
 * Renews the access token when under a minute remains, in a single attempt.
 * Concurrent callers share one refresh; a failure is left to the 401 path of
 * the request.
 */
const ensureFresh = (): Promise<void> => {
  if (freshInflight) return freshInflight;
  const expiresAt = TokenUtils.expiresAt();
  const now = Date.now();
  if (
    !authBridge ||
    !TokenUtils.getTokenSync() ||
    expiresAt === null ||
    expiresAt - now > REFRESH_MARGIN_MS ||
    now - lastProactiveRefreshAt < PROACTIVE_REFRESH_SPACING_MS
  ) {
    return Promise.resolve();
  }
  lastProactiveRefreshAt = now;
  freshInflight = authBridge
    .refresh(1)
    .then(
      () => undefined,
      () => undefined,
    )
    .finally(() => {
      freshInflight = null;
    });
  return freshInflight;
};

/** The epoch whose session was already torn down after a failed refresh. */
let tornDownEpoch = -1;

const handleNoAuth = async (
  requestFn: () => Promise<Response>,
  scope: RequestScope,
  startEpoch: number,
): Promise<Response> => {
  const bridge = requireAuthBridge();
  try {
    await untilAborted(bridge.refresh(), scope.signal);
    return await requestFn();
  } catch (error) {
    // A timeout, a caller abort or a logout ended the request: the session is fine.
    if (scope.signal.aborted) throw error;
    const msg = localizationService.t(
      "auth.session_expired",
      undefined,
      "Session expired. Please log in again.",
    );
    // Concurrent 401s of one session share a single teardown and toast.
    if (tornDownEpoch === startEpoch) throw new Error(msg);
    tornDownEpoch = startEpoch;
    // Local teardown only: the refresh just failed, so the session is
    // already dead server-side; a POST /logout would be a no-op. The
    // full logout() here used to clear a token that a parallel login had
    // just stored and then reloaded the page mid-login.
    await bridge.onAuthFailure();
    ToastService.showError(msg);
    throw new Error(msg);
  }
};

// ── Request engine ────────────────────────────────────────────────────────────

interface RequestConfig {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  data?: any;
  isFileUpload?: boolean;
  signal?: AbortSignal;
  conditional?: boolean;
}

const timeoutFor = ({ method, isFileUpload }: RequestConfig): number => {
  if (isFileUpload) return UPLOAD_TIMEOUT_MS;
  return method === "GET" ? GET_TIMEOUT_MS : WRITE_TIMEOUT_MS;
};

const performRequest = async <T>(config: RequestConfig): Promise<T> => {
  const { method, endpoint, data, isFileUpload, signal, conditional } = config;
  const startEpoch = epoch.current();
  const scope = requestScope(timeoutFor(config), signal);
  const shouldSkipRefresh = NO_REFRESH_ENDPOINTS.some((e) => endpoint.startsWith(e));

  const requestFn = async (): Promise<Response> => {
    const headers = getHeaders(isFileUpload);
    const knownEtag = conditional ? etags.get(endpoint) : undefined;
    if (knownEtag) headers["If-None-Match"] = knownEtag;

    return fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      signal: scope.signal,
      credentials: "include",
      body: isFileUpload ? data : data !== undefined ? JSON.stringify(data) : undefined,
    });
  };

  try {
    if (!TokenUtils.isLoaded()) await TokenUtils.load();
    if (!shouldSkipRefresh) await untilAborted(ensureFresh(), scope.signal);

    let response = await requestFn();

    if (response.status === 401 && !shouldSkipRefresh) {
      // Only enter the refresh/teardown cycle if the request was actually
      // made while signed in. A 401 on an unauthenticated call (anything
      // fired while the user is still on the login screen) must never
      // trigger the token-clearing logout path: it would race and undo a
      // login happening at the same moment.
      if (TokenUtils.getTokenSync()) {
        response = await handleNoAuth(requestFn, scope, startEpoch);
      }
    }

    if (epoch.isStale(startEpoch)) throw abortError();
    if (conditional && response.status === 304) return NOT_MODIFIED as T;

    const result = await handleResponse(response, scope.signal);
    if (epoch.isStale(startEpoch)) throw abortError();

    if (conditional) {
      const etag = response.headers?.get?.("etag");
      if (etag) rememberEtag(endpoint, etag);
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (epoch.isStale(startEpoch)) throw abortError();
    if (scope.timedOut) throw timeoutError();
    throw error;
  } finally {
    scope.dispose();
  }
};

// ── Public API ────────────────────────────────────────────────────────────────

function get<T>(endpoint: string, signal?: AbortSignal): Promise<T>;
function get<T>(
  endpoint: string,
  signal: AbortSignal | undefined,
  options: GetOptions & { conditional: true },
): Promise<T | NotModified>;
function get<T>(
  endpoint: string,
  signal?: AbortSignal,
  options?: GetOptions,
): Promise<T | NotModified> {
  return performRequest<T>({ method: "GET", endpoint, signal, conditional: options?.conditional });
}

export type StreamDone = { total?: number; status?: string };

/** Why a stream ended: its `done` event, an error, the caller's cleanup, or the session ending. */
export type StreamCloseReason = "done" | "error" | "closed" | "aborted";

export interface StreamOptions {
  /** Silence after which the stream fails (default 60 s). */
  idleTimeoutMs?: number;
  /** Treat a `done` event without a JSON `status` as a failed stream. */
  requireDoneStatus?: boolean;
  /** Called once when the stream closes for any reason, after `onDone` or `onError`. */
  onClose?: (reason: StreamCloseReason) => void;
}

/**
 * Global API Utility Service.
 * Provides a type-safe interface for RESTful communication and SSE streaming.
 */
const ApiUtils = {
  configureAuth(bridge: AuthBridge | null): void {
    authBridge = bridge;
  },

  isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  },

  ensureFresh,
  get,

  post<T, R>(endpoint: string, data?: T): Promise<R> {
    return performRequest<R>({ method: "POST", endpoint, data });
  },

  upload<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "POST",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  patchFile<R>(endpoint: string, data: FormData): Promise<R> {
    return performRequest<R>({
      method: "PATCH",
      endpoint,
      data,
      isFileUpload: true,
    });
  },

  put<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PUT", endpoint, data });
  },

  patch<T, R>(endpoint: string, data: T): Promise<R> {
    return performRequest<R>({ method: "PATCH", endpoint, data });
  },

  delete<R>(endpoint: string): Promise<R> {
    return performRequest<R>({ method: "DELETE", endpoint });
  },

  /**
   * Initializes a Server-Sent Events (SSE) stream.
   * Obtains a one-time ticket via POST /auth/ticket (no body required in V2),
   * then opens an EventSource with the ticket as a query parameter.
   *
   * @param endpoint     The streaming endpoint path (e.g. "/sales")
   * @param onMessage    Called for every default `message` event
   * @param onError      Called on stream errors
   * @param onDone       Called when the server emits the "done" event
   * @param options      See `StreamOptions`
   * @returns            A cleanup function that closes the EventSource
   *
   * A stream closed by its cleanup function or by the session epoch ending
   * calls neither `onDone` nor `onError`, only `options.onClose`.
   */
  async stream<T = any>(
    endpoint: string,
    onMessage: (data: { data: T }) => void,
    onError?: (err: any) => void,
    onDone?: (doneData?: StreamDone) => void,
    options: StreamOptions = {},
  ): Promise<() => void> {
    const idleTimeoutMs = options.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
    const startEpoch = epoch.current();
    try {
      // V2: POST /auth/ticket requires no request body
      const { ticket } = await this.post<null, { ticket: string }>("/auth/ticket");

      if (!ticket) throw new Error("SSE Ticket Missing");
      if (epoch.isStale(startEpoch)) {
        options.onClose?.("aborted");
        return () => {};
      }

      const separator = endpoint.includes("?") ? "&" : "?";
      const url = `${API_BASE_URL}${endpoint}${separator}ticket=${encodeURIComponent(ticket)}`;

      const eventSource = new EventSource(url, { withCredentials: true });
      let idleTimer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;

      const cleanup = (reason: StreamCloseReason) => {
        if (closed) return;
        closed = true;
        clearTimeout(idleTimer);
        stopListening?.();
        if (eventSource.readyState !== eventSource.CLOSED) {
          eventSource.close();
        }
        options.onClose?.(reason);
      };

      // Server heartbeats are comment lines the EventSource never surfaces, so
      // only real frames count as activity.
      const armIdleTimer = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          onError?.(timeoutError());
          cleanup("error");
        }, idleTimeoutMs);
      };
      const stopListening = epoch.onAbortAll(() => cleanup("aborted"));
      armIdleTimer();

      eventSource.onmessage = (e) => {
        if (closed) return;
        armIdleTimer();
        try {
          if (!e.data) return;
          onMessage({ data: JSON.parse(e.data) });
        } catch (err) {
          console.error("SSE Parse Error:", err);
          onError?.(err);
        }
      };

      // V2 "done" event carries { total: number } (sales) or { status: "completed" } (more-info)
      eventSource.addEventListener("done", (e: MessageEvent) => {
        if (closed) return;
        let doneData: StreamDone | undefined;
        try {
          doneData = e.data ? JSON.parse(e.data) : undefined;
        } catch {
          doneData = undefined;
        }
        if (options.requireDoneStatus && typeof doneData?.status !== "string") {
          onError?.(new Error("The stream ended with an invalid completion payload."));
          cleanup("error");
          return;
        }
        onDone?.(doneData);
        cleanup("done");
      });

      // Single "error" listener that handles both server-sent "error" events
      // (MessageEvent with data) and connection-level transport errors (Event).
      // Using one handler prevents double-invocation since EventSource.onerror
      // and addEventListener("error") both fire for the same connection failure.
      eventSource.addEventListener("error", (e: Event) => {
        if (closed) return;
        if (e instanceof MessageEvent && e.data) {
          // Server-sent named "error" event carrying a payload
          try {
            const errData = JSON.parse(e.data);
            onError?.(errData);
          } catch {
            onError?.(e);
          }
        } else {
          // Connection-level transport error (network drop, server closed),
          // reported at once whether or not the browser already gave up.
          onError?.(e);
        }
        cleanup("error");
      });

      return () => cleanup("closed");
    } catch (err) {
      if (epoch.isStale(startEpoch)) return () => {};
      console.error("SSE Initialization Error:", err);
      onError?.(err);
      options.onClose?.("error");
      return () => {};
    }
  },
};

export default ApiUtils;
export { ApiError };
