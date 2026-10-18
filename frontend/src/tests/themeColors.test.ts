import { afterEach, describe, expect, it, vi } from "vitest";
import { readCssColor } from "@/utils/themeColors";

afterEach(() => {
  document.documentElement.className = "";
  vi.restoreAllMocks();
});

const stubStyle = (colorFor: () => string) =>
  vi
    .spyOn(window, "getComputedStyle")
    .mockImplementation(
      () => ({ getPropertyValue: () => colorFor() }) as unknown as CSSStyleDeclaration,
    );

describe("readCssColor", () => {
  it("reads computed style once per token within a theme", () => {
    document.documentElement.className = "theme-a";
    const spy = stubStyle(() => " #111111 ");
    expect(readCssColor("--cache-probe-a")).toBe("#111111");
    expect(readCssColor("--cache-probe-a")).toBe("#111111");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the root class changes", () => {
    document.documentElement.className = "light";
    let value = "#ffffff";
    const spy = stubStyle(() => value);
    expect(readCssColor("--cache-probe-b")).toBe("#ffffff");
    value = "#000000";
    document.documentElement.className = "ion-palette-dark";
    expect(readCssColor("--cache-probe-b")).toBe("#000000");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does not cache the fallback for an unresolved token", () => {
    document.documentElement.className = "theme-c";
    let value = "";
    stubStyle(() => value);
    expect(readCssColor("--cache-probe-c", "#abcdef")).toBe("#abcdef");
    value = "#123456";
    expect(readCssColor("--cache-probe-c", "#abcdef")).toBe("#123456");
  });
});
