/**
 * Characterization tests for MoreInfoService: the zero-dependency markdown
 * converter (including its lack of escaping, SEC-07), the SSE accumulation
 * flow, and the cache-shape inconsistency around invalidateInfoCache (BUG-06).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { memoryStore, resetStore } from "./helpers";

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

import MoreInfoService from "@/services/MoreInfoService";
import { BaseService } from "@/services/base/BaseService";

const parse = (md: string): string => MoreInfoService["parseMarkdown"](md);

beforeEach(() => {
  resetStore();
  BaseService.clearMemoryCache();
  stream.endpoints.length = 0;
});

describe("parseMarkdown", () => {
  it("returns an empty string for empty input", () => {
    expect(parse("")).toBe("");
  });

  it("converts headings by level", () => {
    expect(parse("## Light")).toBe('<div><h2 class="info-header">Light</h2></div>');
    expect(parse("### Water")).toBe('<div><h3 class="info-header">Water</h3></div>');
  });

  it("splits a heading glued to the previous word", () => {
    const html = parse("Bright light##Water\n\nWeekly");
    expect(html).toContain('<p class="info-text-paragraph">Bright light</p>');
    expect(html).toContain('<h2 class="info-header">Water</h2>');
  });

  it("wraps each dash item in its own list because blank lines are inserted before items", () => {
    expect(parse("- one\n- two")).toBe(
      '<div><ul class="info-list"><li class="info-item">one</li></ul>' +
        '<ul class="info-list"><li class="info-item">two</li></ul></div>',
    );
  });

  it("keeps numbered and star items of one block in a single list", () => {
    expect(parse("1. first\n2. second")).toBe(
      '<div><ul class="info-list"><li class="info-item">first</li>' +
        '<li class="info-item">second</li></ul></div>',
    );
    expect(parse("* star")).toContain('<li class="info-item">star</li>');
  });

  it("converts bold, italic and bold italic", () => {
    const html = parse("**bold** *em* ***both***");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<strong><em>both</em></strong>");
  });

  it("bolds a leading label before a colon", () => {
    expect(parse("Light: bright")).toContain("<strong>Light:</strong> bright");
  });

  it("renders a partially streamed buffer without throwing", () => {
    expect(() => parse("## Lig")).not.toThrow();
    expect(parse("## Lig")).toContain("Lig");
  });

  it("passes raw HTML through unescaped (SEC-07)", () => {
    const html = parse('<img src=x onerror="alert(1)">');
    expect(html).toContain('<img src=x onerror="alert(1)">');
  });
});

describe("getMoreInfo streaming", () => {
  const messages =
    (...payloads: unknown[]) =>
    (h: StreamHandlers) => {
      for (const payload of payloads) h.onMessage({ data: payload });
      h.onDone?.({ status: "completed" });
    };

  it("requests the stream with plant name, markdown mode and the active locale", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    await MoreInfoService.getMoreInfo("Aloe vera");
    expect(stream.endpoints).toHaveLength(1);
    const url = new URL(stream.endpoints[0], "http://x");
    expect(url.pathname).toBe("/more-info");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      plantName: "Aloe vera",
      htmlFormatting: "false",
      lang: "en",
    });
  });

  it("accumulates links and AI chunks and reports progress through onUpdate", async () => {
    stream.script = messages(
      { type: "ai_chunk", value: "## Light\n\n" },
      { type: "link", value: "https://a.example" },
      { type: "ai_chunk", value: "Bright." },
    );
    const updates: unknown[][] = [];
    const result = await MoreInfoService.getMoreInfo("Aloe", { onUpdate: (u) => updates.push(u) });
    expect(updates.length).toBe(3);
    expect(result[0].links).toEqual(["https://a.example"]);
    expect(result[0].ai).toContain('<h2 class="info-header">Light</h2>');
    expect(result[0].ai).toContain("Bright.");
  });

  it("serves the second request from the cache without streaming again", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    const first = await MoreInfoService.getMoreInfo("Aloe");
    const second = await MoreInfoService.getMoreInfo("Aloe");
    expect(second).toEqual(first);
    expect(stream.endpoints).toHaveLength(1);
  });

  it("streams again with forceUpdate", async () => {
    stream.script = messages({ type: "link", value: "https://a.example" });
    await MoreInfoService.getMoreInfo("Aloe");
    await MoreInfoService.getMoreInfo("Aloe", { forceUpdate: true });
    expect(stream.endpoints).toHaveLength(2);
  });

  it("rejects when the stream reports an error", async () => {
    stream.script = (h) => h.onError?.({ message: "Information stream interrupted" });
    await expect(MoreInfoService.getMoreInfo("Aloe")).rejects.toEqual({
      message: "Information stream interrupted",
    });
  });
});

describe("cache shape (BUG-06)", () => {
  it("leaves the dictionary under the data key after a stream completes", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "link", value: "https://a.example" } });
      h.onDone?.({ status: "completed" });
    };
    await MoreInfoService.getMoreInfo("Aloe");
    const stored = memoryStore.get("more_info_data") as { data?: Record<string, unknown> };
    expect(Object.keys(stored.data ?? {})).toEqual(["Aloe"]);
  });

  it("breaks the next read after invalidateInfoCache rewrote the entry under a different key", async () => {
    stream.script = (h) => {
      h.onMessage({ data: { type: "link", value: "https://a.example" } });
      h.onDone?.({ status: "completed" });
    };
    await MoreInfoService.getMoreInfo("Aloe");
    memoryStore.set("more_info_data", { records: { Aloe: [] }, timestamp: Date.now() });
    BaseService.clearMemoryCache();
    await expect(MoreInfoService.getMoreInfo("Aloe")).rejects.toBeInstanceOf(TypeError);
  });
});
