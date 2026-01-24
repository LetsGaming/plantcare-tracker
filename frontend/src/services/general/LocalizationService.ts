import { ref, readonly, Ref } from "vue";

/** Map of translation keys to their localized strings */
type FlatTranslations = Record<string, string>;
/** Function that returns a promise of translation data for lazy loading */
type Loader = () => Promise<FlatTranslations>;

/**
 * High-performance Localization Service for Vue 3 applications.
 * * Features:
 * - **Atomic Transitions:** Data is loaded fully before switching reactive state to prevent "Key Flicker".
 * - **L1 Memory Cache:** O(1) translation retrieval using native Map structures.
 * - **Request Collapsing:** Merges concurrent requests for the same locale into a single promise.
 * - **Regex Interpolation:** Single-pass regex replacement for high-speed variable injection.
 */
class LocalizationService {
  /** Internal storage for loaded translation maps */
  private translations = new Map<string, FlatTranslations>();
  /** Registry for asynchronous bundle loaders */
  private loaders = new Map<string, Loader>();
  /** Set of locales currently cached in memory */
  private loaded = new Set<string>();
  /** Cache for inflight loading promises to prevent redundant network calls */
  private ongoingLoads = new Map<string, Promise<void>>();

  private readonly storageKey = "pc_locale";
  private readonly fallbackLocale = "en";
  /** Matches tokens formatted as {variableName} */
  private readonly interpRegex = /\{(\w+)\}/g;

  /** Reactive state for the current active locale */
  private _locale = ref<string>(this.initLocale());
  /** Reactive state indicating if a bundle is being fetched */
  private _loading = ref<boolean>(false);

  /**
   * Initializes the service and binds the translation function.
   */
  constructor() {
    this.t = this.t.bind(this);
  }

  /**
   * Determines the initial locale from storage or browser environment.
   * @returns {string} The normalized initial locale.
   * @private
   */
  private initLocale(): string {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) return this.normalizeLocale(stored);
      }
    } catch {
      /* Storage inaccessible */
    }

    return this.detectBrowserLocale() ?? this.fallbackLocale;
  }

  /**
   * Detects the preferred language from the navigator object.
   * @returns {string | null}
   * @private
   */
  private detectBrowserLocale(): string | null {
    if (typeof navigator === "undefined") return null;
    const nav = navigator as any;
    const languages: string[] = nav.languages ? [...nav.languages] : [];
    if (nav.language) languages.unshift(nav.language);

    for (const lang of languages) {
      if (lang) return this.normalizeLocale(lang);
    }
    return null;
  }

  /**
   * Normalizes locale codes (e.g., 'en-US' becomes 'en').
   * @param {string} locale The raw locale string.
   * @returns {string}
   * @protected
   */
  protected normalizeLocale(locale: string): string {
    return locale.toLowerCase().split("-")[0];
  }

  /**
   * Readonly reactive reference to the current locale.
   * @type {Ref<string>}
   */
  get locale(): Ref<string> {
    return readonly(this._locale) as Ref<string>;
  }

  /**
   * Readonly reactive reference to the loading status.
   * @type {Ref<boolean>}
   */
  get isLoading(): Ref<boolean> {
    return readonly(this._loading) as Ref<boolean>;
  }

  /**
   * Gets the current locale string (non-reactive).
   * @returns {string}
   */
  getLocale(): string {
    return this._locale.value;
  }

  /**
   * Switches the application locale.
   * This is an atomic operation: the reactive state only updates AFTER
   * the translation bundle is successfully loaded to prevent UI flickering.
   * @param {string} locale The locale code to switch to.
   * @returns {Promise<void>}
   */
  async setLocale(locale: string): Promise<void> {
    const normalized = this.normalizeLocale(locale);
    if (this._locale.value === normalized) return;

    // Wait for the bundle to be in memory
    await this.ensureLocaleLoaded(normalized);

    // Trigger reactive UI update
    this._locale.value = normalized;

    try {
      localStorage.setItem(this.storageKey, normalized);
    } catch {
      /* Storage inaccessible */
    }
  }

  /**
   * Registers a static set of translations.
   * @param {string} locale The locale code.
   * @param {FlatTranslations} translations Key-value pairs.
   */
  registerTranslations(locale: string, translations: FlatTranslations) {
    const normalized = this.normalizeLocale(locale);
    const existing = this.translations.get(normalized) || {};
    this.translations.set(normalized, { ...existing, ...translations });
    this.loaded.add(normalized);
  }

  /**
   * Registers an async loader (e.g., via Vite's import.meta.glob).
   * @param {string} locale The locale code.
   * @param {Loader} loader A function returning a Promise of translations.
   */
  registerLoader(locale: string, loader: Loader) {
    this.loaders.set(this.normalizeLocale(locale), loader);
  }

  /**
   * Returns all locales that are either loaded or available to be loaded.
   * @returns {string[]}
   */
  availableLocales(): string[] {
    return Array.from(
      new Set([...this.translations.keys(), ...this.loaders.keys()]),
    );
  }

  /**
   * Ensures a translation bundle is fetched and stored in memory.
   * Collapses multiple concurrent requests for the same locale.
   * @param {string} locale The locale to load.
   * @returns {Promise<void>}
   */
  async ensureLocaleLoaded(locale: string): Promise<void> {
    const normalized = this.normalizeLocale(locale);
    if (this.loaded.has(normalized)) return;

    const inflight = this.ongoingLoads.get(normalized);
    if (inflight) return inflight;

    const loader = this.loaders.get(normalized);
    if (!loader) return;

    const loadPromise = (async () => {
      this._loading.value = true;
      try {
        const data = await loader();
        const existing = this.translations.get(normalized) || {};
        this.translations.set(normalized, { ...existing, ...data });
        this.loaded.add(normalized);
      } catch (e) {
        console.error(`[LocalizationService] Load failed: ${normalized}`, e);
      } finally {
        this._loading.value = false;
        this.ongoingLoads.delete(normalized);
      }
    })();

    this.ongoingLoads.set(normalized, loadPromise);
    return loadPromise;
  }

  /**
   * Resolves the initial locale bundle before the app mounts.
   * @returns {Promise<void>}
   */
  public async resolveInitialLocale(): Promise<void> {
    const current = this._locale.value;
    await this.ensureLocaleLoaded(current);
  }

  /**
   * Replaces placeholders in a string with provided variables.
   * @param {string} text The template string.
   * @param {Record<string, string | number>} vars Variables to inject.
   * @returns {string}
   * @private
   */
  private interpolate(
    text: string,
    vars?: Record<string, string | number>,
  ): string {
    if (!vars) return text;
    return text.replace(this.interpRegex, (match, key) => {
      const val = vars[key];
      return val !== undefined && val !== null ? String(val) : match;
    });
  }

  /**
   * The core translation function.
   * Designed for the hot-path in Vue templates. By accessing `this._locale.value`,
   * it registers a dependency that allows Vue to update the UI instantly when the locale changes.
   * * @param {string} key The dot-notation key (e.g., 'home.title').
   * @param {Record<string, string | number>} [vars] Variables for interpolation.
   * @param {string} [fallback] Fallback string if key is missing.
   * @returns {string} The localized and interpolated string.
   */
  t(
    key: string,
    vars?: Record<string, string | number>,
    fallback?: string,
  ): string {
    const activeLocale = this._locale.value;

    if (!key.includes(".")) {
      return this.interpolate(key, vars);
    }

    const localeMap = this.translations.get(activeLocale);
    let text = localeMap?.[key];

    // Fallback logic: User Locale -> Default (English) -> Provided Fallback -> Raw Key
    if (text === undefined) {
      const fallbackMap = this.translations.get(this.fallbackLocale);
      text = fallbackMap?.[key];
    }

    const result = text ?? fallback ?? key;
    return this.interpolate(result, vars);
  }

  /**
   * Checks if a specific key exists within a given locale.
   * @param {string} locale
   * @param {string} key
   * @returns {boolean}
   */
  hasKey(locale: string, key: string): boolean {
    return !!this.translations.get(this.normalizeLocale(locale))?.[key];
  }
}

const localizationService = new LocalizationService();
export default localizationService;
