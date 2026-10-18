import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const moduleLog = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { moduleLog, launch: vi.fn(), backfill: vi.fn(async () => 0) };
});

vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }));
vi.mock('../../../src/core/logging', () => ({
  createModuleLogger: () => mocks.moduleLog,
  logger: mocks.moduleLog,
}));
vi.mock('../../../src/modules/recognition/infrastructure/SQLiteEmbeddingRepository', () => ({
  SQLiteEmbeddingRepository: class {},
}));
vi.mock('../../../src/modules/recognition/application/EmbedImages', () => ({
  EmbedImagesService: class {
    backfill = mocks.backfill;
  },
}));

import type { Embedder } from '../../../src/modules/recognition/domain/Recognition';
import { createRecognition } from '../../../src/modules/recognition';
import {
  BROWSER_IDLE_MS,
  closeBrowser,
  fetchDocument,
} from '../../../src/modules/sales/infrastructure/HttpFetcher';

const fakeBrowser = () => {
  const page = {
    route: vi.fn(async () => undefined),
    goto: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => undefined),
    content: vi.fn(async () => '<html></html>'),
    url: () => 'https://shop.test/',
  };
  const context = { newPage: vi.fn(async () => page), close: vi.fn(async () => undefined) };
  return {
    once: vi.fn(),
    newContext: vi.fn(async () => context),
    close: vi.fn(async () => undefined),
  };
};

describe('recognition readiness', () => {
  const log = { warn: vi.fn(), info: vi.fn() };
  const embedder = { modelId: 'fake' } as unknown as Embedder;

  it('is not ready until the loader resolves, then exposes the embedder', async () => {
    let finish!: (e: Embedder | null) => void;
    const loadEmbedder = () => new Promise<Embedder | null>((resolve) => (finish = resolve));
    const recognition = createRecognition({ loadEmbedder }, log);

    expect(recognition.ready).toBe(false);
    expect(recognition.embedder).toBeNull();

    const loading = recognition.load();
    expect(recognition.ready).toBe(false);
    finish(embedder);
    await loading;

    expect(recognition.ready).toBe(true);
    expect(recognition.embedder).toBe(embedder);
    expect(recognition.embedImages).not.toBeNull();
  });

  it('becomes ready without an embedder when loading fails', async () => {
    const recognition = createRecognition(
      { loadEmbedder: () => Promise.reject(new Error('bad model')) },
      log,
    );
    await recognition.load();
    expect(recognition.ready).toBe(true);
    expect(recognition.embedder).toBeNull();
  });

  it('is ready at once when an embedder is injected', () => {
    expect(createRecognition({ embedder }, log).ready).toBe(true);
    expect(createRecognition({ embedder: null }, log).ready).toBe(true);
  });
});

describe('lazy idle browser', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.launch.mockReset();
  });
  afterEach(async () => {
    await closeBrowser();
    vi.useRealTimers();
  });

  it('launches on demand, closes after the idle period and relaunches on next use', async () => {
    const first = fakeBrowser();
    const second = fakeBrowser();
    mocks.launch.mockResolvedValueOnce(first).mockResolvedValueOnce(second);

    expect(mocks.launch).not.toHaveBeenCalled();
    await fetchDocument('https://shop.test/', true);
    expect(mocks.launch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BROWSER_IDLE_MS - 1);
    expect(first.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(first.close).toHaveBeenCalledTimes(1);

    await fetchDocument('https://shop.test/', true);
    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(second.newContext).toHaveBeenCalledTimes(1);
  });

  it('resets the idle timer on use', async () => {
    const browser = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);

    await fetchDocument('https://shop.test/', true);
    await vi.advanceTimersByTimeAsync(BROWSER_IDLE_MS - 1000);
    await fetchDocument('https://shop.test/', true);
    await vi.advanceTimersByTimeAsync(BROWSER_IDLE_MS - 1000);

    expect(browser.close).not.toHaveBeenCalled();
    expect(mocks.launch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser on shutdown and cancels the idle timer', async () => {
    const browser = fakeBrowser();
    mocks.launch.mockResolvedValue(browser);

    await fetchDocument('https://shop.test/', true);
    await closeBrowser();
    expect(browser.close).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BROWSER_IDLE_MS * 2);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
