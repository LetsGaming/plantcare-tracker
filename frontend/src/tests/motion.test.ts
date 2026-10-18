import { afterEach, describe, expect, it, vi } from "vitest";
import { ionicConfig, prefersReducedMotion, watchReducedMotion } from "@/utils/motion";

const original = window.matchMedia;

const stubMatchMedia = (matches: boolean) => {
  const matchMedia = vi.fn().mockReturnValue({ matches });
  Object.defineProperty(window, "matchMedia", { value: matchMedia, configurable: true });
  return matchMedia;
};

afterEach(() => {
  Object.defineProperty(window, "matchMedia", { value: original, configurable: true });
});

describe("prefersReducedMotion", () => {
  it("is false when matchMedia is unavailable", () => {
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    expect(prefersReducedMotion()).toBe(false);
  });

  it("is true when the reduce query matches", () => {
    const matchMedia = stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(matchMedia.mock.calls[0][0]).toContain("prefers-reduced-motion: reduce");
  });

  it("is false when the reduce query does not match", () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("ionicConfig", () => {
  it("turns Ionic animations off under reduced motion", () => {
    stubMatchMedia(true);
    expect(ionicConfig()).toEqual({ animated: false });
  });

  it("leaves Ionic defaults otherwise", () => {
    stubMatchMedia(false);
    expect(ionicConfig()).toEqual({});
  });
});

describe("watchReducedMotion", () => {
  const stubListenable = () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const query = {
      matches: false,
      addEventListener: vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.add(fn),
      ),
      removeEventListener: vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
      ),
    };
    Object.defineProperty(window, "matchMedia", {
      value: vi.fn().mockReturnValue(query),
      configurable: true,
    });
    const emit = (matches: boolean) =>
      listeners.forEach((fn) => fn({ matches } as MediaQueryListEvent));
    return { query, listeners, emit };
  };

  it("reports preference changes from the media query change event", () => {
    const { emit } = stubListenable();
    const seen: boolean[] = [];
    watchReducedMotion((reduced) => seen.push(reduced));
    emit(true);
    emit(false);
    expect(seen).toEqual([true, false]);
  });

  it("removes its listener when stopped", () => {
    const { listeners, emit } = stubListenable();
    const seen: boolean[] = [];
    const stop = watchReducedMotion((reduced) => seen.push(reduced));
    expect(listeners.size).toBe(1);
    stop();
    emit(true);
    expect(listeners.size).toBe(0);
    expect(seen).toEqual([]);
  });

  it("is a no-op without matchMedia", () => {
    Object.defineProperty(window, "matchMedia", { value: undefined, configurable: true });
    expect(() => watchReducedMotion(() => {})()).not.toThrow();
  });
});
