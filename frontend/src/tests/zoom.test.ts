import { describe, expect, it } from "vitest";
import { PAN_STEP, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom, stepZoom } from "@/utils/zoom";

describe("clampZoom", () => {
  it("raises values below the minimum and lowers values above the maximum", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(7)).toBe(3);
  });

  it("passes values inside the range through", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(1.7)).toBe(1.7);
    expect(clampZoom(3)).toBe(3);
  });
});

describe("stepZoom", () => {
  it("steps by half a level in either direction", () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(2, -1)).toBe(1.5);
  });

  it("stays inside the zoom range", () => {
    expect(stepZoom(3, 1)).toBe(3);
    expect(stepZoom(1, -1)).toBe(1);
  });

  it("reaches the maximum exactly after repeated steps", () => {
    let zoom: number = ZOOM_MIN;
    for (let i = 0; i < 6; i++) zoom = stepZoom(zoom, 1);
    expect(zoom).toBe(ZOOM_MAX);
  });

  it("exposes the step and pan constants", () => {
    expect(ZOOM_STEP).toBe(0.5);
    expect(PAN_STEP).toBe(40);
  });
});
