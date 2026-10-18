import storageService from "@/services/general/StorageService";

const STORAGE_KEY = "darkMode";
/** Read by the inline script in index.html: keep both in step. */
export const THEME_MIRROR_KEY = "plantcare.theme";
const DARK_CLASS = "ion-palette-dark";

const systemPrefersDark = (): boolean => window.matchMedia("(prefers-color-scheme: dark)").matches;

const readMirror = (): boolean | null => {
  try {
    const value = localStorage.getItem(THEME_MIRROR_KEY);
    return value === "dark" ? true : value === "light" ? false : null;
  } catch {
    return null;
  }
};

const writeMirror = (dark: boolean): void => {
  try {
    localStorage.setItem(THEME_MIRROR_KEY, dark ? "dark" : "light");
  } catch {
    // The mirror is only a first-paint cache.
  }
};

/** Applies the class and the browser chrome color; the single place dark mode is switched. */
const apply = (dark: boolean): void => {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  const chrome = getComputedStyle(document.documentElement).getPropertyValue("--chrome-bg").trim();
  if (chrome) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chrome);
};

export const isDarkMode = (): boolean => document.documentElement.classList.contains(DARK_CLASS);

let changeCount = 0;

export const setDarkMode = async (dark: boolean): Promise<void> => {
  changeCount++;
  apply(dark);
  writeMirror(dark);
  await storageService.set(STORAGE_KEY, dark);
};

/**
 * Synchronous: the mirror (or the system setting) decides the first paint, the stored choice is
 * reconciled in the background because storage stays the source of truth.
 */
export const applyInitialTheme = (): Promise<void> => {
  try {
    apply(readMirror() ?? systemPrefersDark());
  } catch {
    // Leave the inline script's result in place.
  }
  return reconcileTheme();
};

const reconcileTheme = async (): Promise<void> => {
  const startedAt = changeCount;
  try {
    const stored = await storageService.get<boolean>(STORAGE_KEY);
    if (typeof stored !== "boolean" || changeCount !== startedAt) return;
    writeMirror(stored);
    if (stored !== isDarkMode()) apply(stored);
  } catch {
    // Keep what the first paint used.
  }
};
