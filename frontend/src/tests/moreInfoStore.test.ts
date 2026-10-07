/**
 * Tests for the more-info store: the SSE accumulation flow, the per plant and
 * language cache keys and what is persisted.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createInstalledPinia, memoryStore, resetStore } from "./helpers";

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
        return () => {};
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

const newStore = async () => {
  await createInstalledPinia();
  return useMoreInfoStore();
};

beforeEach(() => {
  resetStore();
  stream.endpoints.length = 0;
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
    expect(store.infoFor("Aloe")[0].ai).toContain('<h2 class="info-header">Light</h2>');

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

  it("rejects, clears the draft and stores nothing when the stream reports an error", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "ai_chunk", value: "partial" } });
      h.onError?.({ message: "Information stream interrupted" });
    };
    const store = await newStore();
    await expect(store.ensureInfo("Aloe")).rejects.toEqual({
      message: "Information stream interrupted",
    });
    expect(store.drafts["en:Aloe"]).toBeUndefined();
    expect(store.byKey["en:Aloe"]).toBeUndefined();
    expect(store.streaming["en:Aloe"]).toBe(false);
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
