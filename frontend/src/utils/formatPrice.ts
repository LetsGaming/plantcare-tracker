import localizationService from "@/services/general/LocalizationService";

const CURRENCY = "EUR";

export const formatPrice = (value: number, locale = localizationService.getLocale()): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: CURRENCY }).format(value);

/** Whole-number discount of `price` against `oldPrice`, 0 when there is none. */
export const discountPercent = (price: number, oldPrice: number): number => {
  if (!(oldPrice > price) || !(oldPrice > 0)) return 0;
  return Math.round((1 - price / oldPrice) * 100);
};

/** Signed percent text such as "-43 %", empty when there is no discount. */
export const formatDiscount = (
  price: number,
  oldPrice: number,
  locale = localizationService.getLocale(),
): string => {
  const percent = discountPercent(price, oldPrice);
  if (percent === 0) return "";
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(
    -percent / 100,
  );
};
