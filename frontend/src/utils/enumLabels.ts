import localizationService from "@/services/general/LocalizationService";

const FERTILIZER_KEYS: Record<string, string> = {
  organic: "copy2.fertilizer.organic",
  synthetic: "copy2.fertilizer.synthetic",
};

const FINENESS_KEYS: Record<string, string> = {
  fine: "copy2.fineness.fine",
  medium: "copy2.fineness.medium",
  coarse: "copy2.fineness.coarse",
};

const labelFor = (keys: Record<string, string>, name: string | undefined | null): string => {
  if (!name) return "";
  const key = keys[name.trim().toLowerCase()];
  if (!key) return name;
  const label = localizationService.t(key, undefined, "");
  return label || name;
};

/** Localized fertilizer type; unknown names pass through unchanged. */
export const fertilizerLabel = (name: string | undefined | null): string =>
  labelFor(FERTILIZER_KEYS, name);

/** Localized component fineness level; unknown names pass through unchanged. */
export const finenessLabel = (name: string | undefined | null): string =>
  labelFor(FINENESS_KEYS, name);

/** Number formatted with the app locale (decimal comma in German). */
export const formatNumber = (value: number, locale?: string): string =>
  new Intl.NumberFormat(locale ?? localizationService.getLocale(), {
    maximumFractionDigits: 2,
  }).format(value);

/** "1 Teil", "0,5 Teile", "2 Teile": plural category and number format follow the locale. */
export const partsLabel = (count: number, locale?: string): string => {
  const active = locale ?? localizationService.getLocale();
  const category = new Intl.PluralRules(active).select(count) === "one" ? "one" : "other";
  return localizationService.t(`copy2.parts.${category}`, { count: formatNumber(count, active) });
};
