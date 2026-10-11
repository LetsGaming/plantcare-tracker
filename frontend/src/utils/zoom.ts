export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
export const ZOOM_STEP = 0.5;
export const PAN_STEP = 40;

export const clampZoom = (value: number): number => Math.min(Math.max(ZOOM_MIN, value), ZOOM_MAX);

export const stepZoom = (current: number, direction: 1 | -1): number =>
  clampZoom(current + direction * ZOOM_STEP);
