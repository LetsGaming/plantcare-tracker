const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
};

export const ionicConfig = (): { animated?: boolean } =>
  prefersReducedMotion() ? { animated: false } : {};

export const watchReducedMotion = (callback: (reduced: boolean) => void): (() => void) => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  if (typeof query.addEventListener !== "function") return () => {};
  const listener = (event: MediaQueryListEvent) => callback(event.matches);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
};
