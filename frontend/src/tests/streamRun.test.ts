import { beforeEach, describe, expect, it, vi } from "vitest";

type Handlers = {
  onMessage: (e: { data: unknown }) => void;
  onError?: (e: unknown) => void;
  onDone?: (d?: { total?: number; status?: string }) => void;
  options?: { onClose?: (reason: string) => void };
};

const api = vi.hoisted(() => ({
  handlers: null as Handlers | null,
  close: vi.fn(),
  stream: vi.fn(),
}));

vi.mock("@/utils/apiUtils", () => ({ default: { stream: api.stream } }));

import { epoch } from "@/stores/resource";
import { startStream } from "@/stores/streamRun";

beforeEach(() => {
  api.handlers = null;
  api.close.mockClear();
  api.stream.mockReset();
  api.stream.mockImplementation(
    async (
      _endpoint: string,
      onMessage: Handlers["onMessage"],
      onError: Handlers["onError"],
      onDone: Handlers["onDone"],
      options: Handlers["options"],
    ) => {
      api.handlers = { onMessage, onError, onDone, options };
      return api.close;
    },
  );
});

const open = async (overrides: Partial<Parameters<typeof startStream<number>>[0]> = {}) => {
  const onMessage = vi.fn();
  const onDone = vi.fn();
  const onSettled = vi.fn();
  const run = startStream<number>({ endpoint: "/x", onMessage, onDone, onSettled, ...overrides });
  await vi.waitFor(() => expect(api.handlers).not.toBeNull());
  await Promise.resolve();
  return { run, onMessage, onDone, onSettled, h: api.handlers as Handlers };
};

describe("startStream", () => {
  it("passes messages through and resolves once on done", async () => {
    const { run, onMessage, onDone, onSettled, h } = await open();
    h.onMessage({ data: 7 });
    h.onDone?.({ total: 1 });
    h.onDone?.({ total: 1 });
    await expect(run.promise).resolves.toBeUndefined();
    expect(onMessage).toHaveBeenCalledWith(7);
    expect(onDone).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledWith("done");
    expect(api.close).toHaveBeenCalled();
  });

  it("rejects with the error of an error event and ignores later events", async () => {
    const { run, onMessage, onSettled, h } = await open();
    h.onError?.(new Error("boom"));
    await expect(run.promise).rejects.toThrow("boom");
    h.onMessage({ data: 1 });
    expect(onMessage).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("failed");
  });

  it("fails when a handler throws", async () => {
    const { run, h } = await open({
      onMessage: () => {
        throw new Error("bad frame");
      },
    });
    h.onMessage({ data: 1 });
    await expect(run.promise).rejects.toThrow("bad frame");
  });

  it("fails when the done handler throws", async () => {
    const { run, h } = await open({
      onDone: () => {
        throw new Error("bad status");
      },
    });
    h.onDone?.({ status: "failed" });
    await expect(run.promise).rejects.toThrow("bad status");
  });

  it("resolves as stopped when stopped and closes the stream", async () => {
    const { run, onSettled } = await open();
    run.stop();
    await expect(run.promise).resolves.toBeUndefined();
    expect(onSettled).toHaveBeenCalledWith("stopped");
    expect(api.close).toHaveBeenCalled();
  });

  it("stops when the session ends", async () => {
    const { run, onSettled } = await open();
    epoch.abortAll();
    await expect(run.promise).resolves.toBeUndefined();
    expect(onSettled).toHaveBeenCalledWith("stopped");
  });

  it("stops before the next event when isActive turns false", async () => {
    let active = true;
    const { run, onMessage, onSettled, h } = await open({ isActive: () => active });
    active = false;
    h.onMessage({ data: 1 });
    await expect(run.promise).resolves.toBeUndefined();
    expect(onMessage).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith("stopped");
  });

  it("stops when the transport closes without a terminal event", async () => {
    const { run, onSettled, h } = await open();
    h.options?.onClose?.("aborted");
    await expect(run.promise).resolves.toBeUndefined();
    expect(onSettled).toHaveBeenCalledWith("stopped");
  });

  it("closes a stream that opens after the run already settled", async () => {
    let release!: () => void;
    api.stream.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(api.close);
        }),
    );
    const run = startStream<number>({ endpoint: "/x", onMessage: vi.fn(), onDone: vi.fn() });
    run.stop();
    await run.promise;
    release();
    await vi.waitFor(() => expect(api.close).toHaveBeenCalled());
  });

  it("stops a stream that opened after it was superseded", async () => {
    let release!: () => void;
    let active = true;
    api.stream.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(api.close);
        }),
    );
    const run = startStream<number>({
      endpoint: "/x",
      onMessage: vi.fn(),
      onDone: vi.fn(),
      isActive: () => active,
    });
    active = false;
    release();
    await expect(run.promise).resolves.toBeUndefined();
    expect(api.close).toHaveBeenCalled();
  });

  it("forwards the idle timeout and done status requirement", async () => {
    await open({ idleTimeoutMs: 5, requireDoneStatus: true });
    expect(api.stream.mock.calls[0][4]).toMatchObject({
      idleTimeoutMs: 5,
      requireDoneStatus: true,
    });
  });
});
