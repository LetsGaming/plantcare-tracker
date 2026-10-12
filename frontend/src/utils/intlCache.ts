const cache = new Map<string, unknown>();

const memoized = <T>(
  kind: string,
  locale: string,
  options: object | undefined,
  make: () => T,
): T => {
  const key = `${kind}|${locale}|${options ? JSON.stringify(options) : ""}`;
  let instance = cache.get(key) as T | undefined;
  if (instance === undefined) {
    instance = make();
    cache.set(key, instance);
  }
  return instance;
};

export const numberFormat = (
  locale: string,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat =>
  memoized("number", locale, options, () => new Intl.NumberFormat(locale, options));

export const collator = (locale?: string, options?: Intl.CollatorOptions): Intl.Collator =>
  memoized("collator", locale ?? "", options, () => new Intl.Collator(locale, options));

export const dateTimeFormat = (
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat =>
  memoized("date", locale, options, () => new Intl.DateTimeFormat(locale, options));

export const relativeTimeFormat = (
  locale: string,
  options?: Intl.RelativeTimeFormatOptions,
): Intl.RelativeTimeFormat =>
  memoized("relative", locale, options, () => new Intl.RelativeTimeFormat(locale, options));

export const pluralRules = (locale: string, options?: Intl.PluralRulesOptions): Intl.PluralRules =>
  memoized("plural", locale, options, () => new Intl.PluralRules(locale, options));

/** Comparator equal to `a.localeCompare(b, locale, options)` without building a collator per call. */
export const compareText = (
  locale?: string,
  options?: Intl.CollatorOptions,
): ((a: string, b: string) => number) => {
  const compare = collator(locale, options).compare;
  return (a, b) => compare(a, b);
};
