import storageService from "@/services/general/StorageService";

const STORAGE_KEY = "darkMode";
const DARK_CLASS = "ion-palette-dark";

const systemPrefersDark = (): boolean => window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Applies the class and the browser chrome color; the single place dark mode is switched. */
const apply = (dark: boolean): void => {
  document.documentElement.classList.toggle(DARK_CLASS, dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#14221a" : "#1f6b3b");
};

export const isDarkMode = (): boolean => document.documentElement.classList.contains(DARK_CLASS);

export const setDarkMode = async (dark: boolean): Promise<void> => {
  apply(dark);
  await storageService.set(STORAGE_KEY, dark);
};

/** Stored choice first, the system setting otherwise. Run before the app mounts so the first paint is right. */
export const applyInitialTheme = async (): Promise<void> => {
  try {
    const stored = await storageService.get<boolean>(STORAGE_KEY);
    apply(typeof stored === "boolean" ? stored : systemPrefersDark());
  } catch {
    apply(systemPrefersDark());
  }
};
