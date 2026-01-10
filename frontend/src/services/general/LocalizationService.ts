import { ref, readonly, Ref } from "vue";

type FlatTranslations = Record<string, string>;
type Loader = () => Promise<FlatTranslations>;

class LocalizationService {
  private translations = new Map<string, FlatTranslations>();
  private loaders = new Map<string, Loader>();
  private loaded = new Set<string>();
  private storageKey = "pc_locale";

  private _locale = ref<string>(this.initLocale());
  private _loading = ref<boolean>(false);

  private initLocale(): string {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) return this.normalizeLocale(stored);
      }
    } catch (_) {}

    const browser = this.detectBrowserLocale();
    return browser ?? "en";
  }

  private detectBrowserLocale(): string | null {
    if (typeof navigator === "undefined") return null;

    const candidates = [navigator.language, ...(navigator.languages ?? [])]
      .filter(Boolean)
      .map((l) => this.normalizeLocale(l));

    return candidates[0] ?? null;
  }

  private normalizeLocale(locale: string): string {
    return locale.toLowerCase().split("-")[0];
  }

  get locale(): Ref<string> {
    return readonly(this._locale) as Ref<string>;
  }

  get isLoading(): Ref<boolean> {
    return readonly(this._loading) as Ref<boolean>;
  }

  getLocale(): string {
    return this._locale.value;
  }

  async setLocale(locale: string): Promise<void> {
    const normalized = this.normalizeLocale(locale);
    if (this._locale.value === normalized) return;

    this._locale.value = normalized;
    try {
      localStorage.setItem(this.storageKey, normalized);
    } catch (_) {}

    await this.ensureLocaleLoaded(normalized);
  }

  registerTranslations(locale: string, translations: FlatTranslations) {
    const normalized = this.normalizeLocale(locale);
    const existing = this.translations.get(normalized) || {};

    this.translations.set(
      normalized,
      Object.assign({}, existing, translations)
    );
    this.loaded.add(normalized);
  }

  registerLoader(locale: string, loader: Loader) {
    this.loaders.set(this.normalizeLocale(locale), loader);
  }

  availableLocales(): string[] {
    const fromTranslations = Array.from(this.translations.keys());
    const fromLoaders = Array.from(this.loaders.keys());
    return Array.from(new Set([...fromTranslations, ...fromLoaders]));
  }

  async ensureLocaleLoaded(locale: string): Promise<void> {
    const normalized = this.normalizeLocale(locale);

    if (this.loaded.has(normalized)) return;

    const loader = this.loaders.get(normalized);
    if (!loader) return;
    if (this._loading.value) return;

    this._loading.value = true;
    try {
      const data = await loader();
      this.translations.set(normalized, data);
      this.loaded.add(normalized);
    } catch (_) {
      // ignore loader errors
    } finally {
      this._loading.value = false;
    }
  }

  async resolveInitialLocale(): Promise<void> {
    const current = this._locale.value;

    if (this.translations.has(current) || this.loaders.has(current)) {
      await this.ensureLocaleLoaded(current);
      return;
    }

    const browser = this.detectBrowserLocale();
    if (
      browser &&
      (this.translations.has(browser) || this.loaders.has(browser))
    ) {
      await this.setLocale(browser);
      return;
    }

    await this.setLocale("en");
  }

  private interpolate(
    text: string,
    vars?: Record<string, string | number>
  ): string {
    if (!vars) return text;

    let out = text;
    for (const k of Object.keys(vars)) {
      out = out.split(`{${k}}`).join(String(vars[k]));
    }
    return out;
  }

  t(
    key: string,
    vars?: Record<string, string | number>,
    fallback?: string
  ): string {
    if (!key.includes(".")) {
      return this.interpolate(key, vars);
    }

    const locale = this._locale.value;
    const localeMap = this.translations.get(locale);
    const enMap = this.translations.get("en");

    const entry = localeMap?.[key] ?? enMap?.[key];
    const text = entry ?? fallback ?? key;

    return this.interpolate(text, vars);
  }

  hasKey(locale: string, key: string): boolean {
    return !!this.translations.get(this.normalizeLocale(locale))?.[key];
  }
}

const localizationService = new LocalizationService();
export default localizationService;
