/**
 * Tests for the more-info store: the SSE accumulation flow, the per plant and
 * language cache keys and what is persisted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore, toast } from "./helpers";

vi.mock("@/services/general/StorageService", async () =>
  (await import("./helpers")).storageModule(),
);
vi.mock("@/services/general/ToastService", async () => (await import("./helpers")).toastModule());
vi.mock("@/services/general/LocalizationService", async () =>
  (await import("./helpers")).localizationModule(),
);

type StreamHandlers = {
  onMessage: (event: { data: unknown }) => void;
  onError?: (err: unknown) => void;
  onDone?: (done?: { status?: string }) => void;
};

const stream = vi.hoisted(() => ({
  endpoints: [] as string[],
  script: (_h: StreamHandlers): void => {},
  cleanup: vi.fn(),
}));

vi.mock("@/utils/apiUtils", () => ({
  default: {
    isApiError: () => false,
    configureAuth: vi.fn(),
    stream: vi.fn(
      async (
        endpoint: string,
        onMessage: StreamHandlers["onMessage"],
        onError: StreamHandlers["onError"],
        onDone: StreamHandlers["onDone"],
      ) => {
        stream.endpoints.push(endpoint);
        queueMicrotask(() => stream.script({ onMessage, onError, onDone }));
        return stream.cleanup;
      },
    ),
  },
}));

import { useMoreInfoStore } from "@/stores/moreInfo";

const messages =
  (...payloads: unknown[]) =>
  (h: StreamHandlers) => {
    for (const payload of payloads) h.onMessage({ data: payload });
    h.onDone?.({ status: "completed" });
  };

type StoredGuides = { data: Record<string, unknown> };

const newStore = async () => {
  await createInstalledPinia();
  return useMoreInfoStore();
};

beforeEach(() => {
  resetStore();
  stream.endpoints.length = 0;
  stream.cleanup.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ensureInfo streaming", () => {
  it("requests the stream with plant name, markdown mode and the active locale", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe vera");
    expect(stream.endpoints).toHaveLength(1);
    const url = new URL(stream.endpoints[0], "http://x");
    expect(url.pathname).toBe("/more-info");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      plantName: "Aloe vera",
      htmlFormatting: "false",
      lang: "en",
    });
  });

  it("accumulates links and AI chunks into a draft while streaming and commits on completion", async () => {
    let finish!: () => void;
    stream.script = (h) => {
      h.onMessage({ data: { type: "ai_chunk", value: "## Light\n\n" } });
      h.onMessage({ data: { type: "link", value: "https://a.example" } });
      h.onMessage({ data: { type: "ai_chunk", value: "Bright." } });
      finish = () => h.onDone?.({ status: "completed" });
    };
    const store = await newStore();
    const pending = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(store.infoFor("Aloe")[0]?.ai).toContain("Bright."));

    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.streaming["en:Aloe"]).toBe(true);
    expect(store.infoFor("Aloe")[0].ai).toContain('<h3 class="info-header">Light</h3>');

    finish();
    await pending;
    expect(store.streaming["en:Aloe"]).toBe(false);
    expect(store.drafts["en:Aloe"]).toBeUndefined();
    expect(store.byKey["en:Aloe"][0].links).toEqual(["https://a.example"]);
    expect(store.infoFor("Aloe")).toEqual(store.byKey["en:Aloe"]);
  });

  it("serves the second request from memory without streaming again", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    await store.ensureInfo("Aloe");
    expect(stream.endpoints).toHaveLength(1);
  });

  it("shares one stream between concurrent callers", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await Promise.all([store.ensureInfo("Aloe"), store.ensureInfo("Aloe")]);
    expect(stream.endpoints).toHaveLength(1);
  });

  it("streams again when forced", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    await store.ensureInfo("Aloe", { force: true });
    expect(stream.endpoints).toHaveLength(2);
  });

  it("keeps plants apart", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    await store.ensureInfo("Ficus");
    expect(stream.endpoints).toHaveLength(2);
    expect(Object.keys(store.byKey).sort()).toEqual(["en:Aloe", "en:Ficus"]);
  });

  it("rejects, keeps the partial draft for display and stores nothing when the stream reports an error", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "ai_chunk", value: "partial" } });
      h.onError?.({ message: "Information stream interrupted" });
    };
    const store = await newStore();
    await expect(store.ensureInfo("Aloe")).rejects.toEqual({
      message: "Information stream interrupted",
    });
    expect(store.infoFor("Aloe")[0].ai).toContain("partial");
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.streaming["en:Aloe"]).toBe(false);
    expect(toast.showError).not.toHaveBeenCalled();
  });

  it("treats a done status other than completed as a failure that is not cached", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "ai_chunk", value: "half a guide" } });
      h.onDone?.({ status: "failed" });
    };
    const store = await newStore();
    await expect(store.ensureInfo("Aloe")).rejects.toThrow("failed");
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.fetchedAtByKey["en:Aloe"]).toBeUndefined();
    expect(store.streaming["en:Aloe"]).toBe(false);
  });

  it("clears the partial draft and streams again on the next attempt", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "ai_chunk", value: "partial" } });
      h.onError?.({ message: "boom" });
    };
    const store = await newStore();
    await expect(store.ensureInfo("Aloe")).rejects.toBeDefined();
    stream.script = messages({ type: "ai_chunk", value: "whole guide" });
    await store.ensureInfo("Aloe");
    expect(stream.endpoints).toHaveLength(2);
    expect(store.drafts["en:Aloe"]).toBeUndefined();
    expect(store.byKey["en:Aloe"][0].ai).toContain("whole guide");
  });

  it("does not persist a failed run", async () => {
    vi.useFakeTimers();
    stream.script = (h) => h.onDone?.({ status: "failed" });
    const store = await newStore();
    await expect(store.ensureInfo("Aloe")).rejects.toBeDefined();
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("more_info_data") as
      { data: Record<string, unknown> } | undefined;
    expect(Object.keys(stored?.data ?? {})).toEqual([]);
  });
});

describe("persistence", () => {
  it("stores the completed guides under the data key", async () => {
    vi.useFakeTimers();
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("more_info_data") as { data: Record<string, unknown> };
    expect(Object.keys(stored.data)).toEqual(["en:Aloe"]);
  });

  it("ignores an entry written under the old shape instead of failing", async () => {
    memoryStore.set("more_info_data", { records: { Aloe: [] }, timestamp: Date.now() });
    stream.script = messages({ type: "link", value: "https://a.example" });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    expect(stream.endpoints).toHaveLength(1);
  });

  it("hydrates a fresh stored guide instead of streaming", async () => {
    memoryStore.set("more_info_data", {
      data: { "en:Aloe": [{ links: [], ai: "<div>cached</div>" }] },
      timestamp: Date.now(),
    });
    const store = await newStore();
    await store.ensureInfo("Aloe");
    expect(stream.endpoints).toHaveLength(0);
    expect(store.infoFor("Aloe")[0].ai).toBe("<div>cached</div>");
  });
});

describe("stopInfo", () => {
  const startOpenStream = () => {
    const live: StreamHandlers[] = [];
    stream.script = (h) => {
      live.push(h);
      h.onMessage({ data: { type: "ai_chunk", value: "partial text" } });
    };
    return live;
  };

  it("closes the stream through the cleanup the stream returned", async () => {
    startOpenStream();
    const store = await newStore();
    const pending = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(store.infoFor("Aloe")[0]?.ai).toContain("partial text"));

    store.stopInfo("Aloe");
    await pending;
    expect(stream.cleanup).toHaveBeenCalledTimes(1);
  });

  it("settles every coalesced caller, keeps the draft and caches nothing", async () => {
    startOpenStream();
    const store = await newStore();
    const first = store.ensureInfo("Aloe");
    const second = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(store.infoFor("Aloe")[0]?.ai).toContain("partial text"));
    expect(stream.endpoints).toHaveLength(1);

    store.stopInfo("Aloe");
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);

    expect(store.streaming["en:Aloe"]).toBe(false);
    expect(store.infoFor("Aloe")[0].ai).toContain("partial text");
    expect(store.drafts["en:Aloe"]).toBeDefined();
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.fetchedAtByKey["en:Aloe"]).toBeUndefined();
  });

  it("does not persist a stopped run", async () => {
    vi.useFakeTimers();
    startOpenStream();
    const store = await newStore();
    const pending = store.ensureInfo("Aloe");
    await vi.advanceTimersByTimeAsync(10);
    store.stopInfo("Aloe");
    await pending;
    await vi.advanceTimersByTimeAsync(500);
    const stored = memoryStore.get("more_info_data") as StoredGuides | undefined;
    expect(Object.keys(stored?.data ?? {})).toEqual([]);
  });

  it("stops a load that is still hydrating without ever opening a stream", async () => {
    vi.useFakeTimers();
    startOpenStream();
    const store = await newStore();
    let release!: () => void;
    vi.spyOn(store, "$hydrate").mockImplementation(
      () => new Promise<boolean>((resolve) => (release = () => resolve(false))),
    );
    const pending = store.ensureInfo("Aloe");
    await vi.advanceTimersByTimeAsync(0);

    store.stopInfo("Aloe");
    release();
    await expect(pending).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(500);

    expect(stream.endpoints).toHaveLength(0);
    expect(store.streaming["en:Aloe"]).toBeFalsy();
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.fetchedAtByKey["en:Aloe"]).toBeUndefined();
    const stored = memoryStore.get("more_info_data") as StoredGuides | undefined;
    expect(Object.keys(stored?.data ?? {})).toEqual([]);
  });

  it("does not let an earlier stop cancel a later forced load", async () => {
    const store = await newStore();
    store.stopInfo("Aloe");
    stream.script = messages({ type: "ai_chunk", value: "whole guide" });
    await store.ensureInfo("Aloe", { force: true });
    expect(stream.endpoints).toHaveLength(1);
    expect(store.byKey["en:Aloe"][0].ai).toContain("whole guide");
  });

  it("clears a stop request when the stopped load settles", async () => {
    let release!: () => void;
    const store = await newStore();
    vi.spyOn(store, "$hydrate").mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (release = () => resolve(false))),
    );
    const pending = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    store.stopInfo("Aloe");
    release();
    await pending;

    stream.script = messages({ type: "ai_chunk", value: "whole guide" });
    await store.ensureInfo("Aloe", { force: true });
    expect(stream.endpoints).toHaveLength(1);
    expect(store.byKey["en:Aloe"][0].ai).toContain("whole guide");
  });

  it("ignores messages, errors and completion arriving after the stop", async () => {
    const live = startOpenStream();
    const store = await newStore();
    const pending = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(live).toHaveLength(1));
    await vi.waitFor(() => expect(store.infoFor("Aloe")[0]?.ai).toContain("partial text"));

    store.stopInfo("Aloe");
    await pending;
    const before = JSON.stringify(store.infoFor("Aloe"));

    live[0].onMessage({ data: { type: "ai_chunk", value: " late words" } });
    live[0].onMessage({ data: { type: "link", value: "https://late.example" } });
    live[0].onError?.({ message: "late failure" });
    live[0].onDone?.({ status: "completed" });

    expect(JSON.stringify(store.infoFor("Aloe"))).toBe(before);
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.streaming["en:Aloe"]).toBe(false);
  });

  it("does nothing when no stream runs for that plant", async () => {
    const store = await newStore();
    expect(() => store.stopInfo("Aloe")).not.toThrow();
    expect(stream.cleanup).not.toHaveBeenCalled();
  });

  it("starts a clean stream and clears the old draft on a forced load afterwards", async () => {
    const live = startOpenStream();
    const store = await newStore();
    const pending = store.ensureInfo("Aloe");
    await vi.waitFor(() => expect(store.infoFor("Aloe")[0]?.ai).toContain("partial text"));
    store.stopInfo("Aloe");
    await pending;

    stream.script = messages({ type: "ai_chunk", value: "whole guide" });
    await store.ensureInfo("Aloe", { force: true });

    expect(stream.endpoints).toHaveLength(2);
    expect(live).toHaveLength(1);
    expect(store.drafts["en:Aloe"]).toBeUndefined();
    expect(store.byKey["en:Aloe"][0].ai).toContain("whole guide");
    expect(store.byKey["en:Aloe"][0].ai).not.toContain("partial text");
  });
});
