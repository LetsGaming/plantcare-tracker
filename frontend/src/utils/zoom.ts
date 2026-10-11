export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.5;
export const PAN_STEP = 40;
/** Keyboard panning stops at this many pixels per zoom level above 1 in each direction. */
export const PAN_LIMIT_PER_LEVEL = 150;

export const clampZoom = (value: number): number => Math.min(Math.max(ZOOM_MIN, value), ZOOM_MAX);

export const stepZoom = (current: number, direction: 1 | -1): number =>
  clampZoom(current + direction * ZOOM_STEP);
