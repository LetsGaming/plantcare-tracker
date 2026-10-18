import { afterEach, describe, expect, it, vi } from "vitest";
import { ionicConfig, prefersReducedMotion } from "@/utils/motion";

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
