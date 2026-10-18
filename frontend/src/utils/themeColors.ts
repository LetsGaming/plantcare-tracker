const cache = new Map<string, string>();
let cachedTheme = "";

export const readCssColor = (name: string, fallback = "#000000"): string => {
  if (typeof document === "undefined") return fallback;
  const root = document.documentElement;
  if (root.className !== cachedTheme) {
    cache.clear();
    cachedTheme = root.className;
  }
  const hit = cache.get(name);
  if (hit !== undefined) return hit;
  const value = getComputedStyle(root).getPropertyValue(name).trim();
  if (value) cache.set(name, value);
  return value || fallback;
};

export const watchTheme = (callback: () => void): (() => void) => {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};
