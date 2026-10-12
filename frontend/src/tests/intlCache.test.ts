import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collator,
  compareText,
  dateTimeFormat,
  numberFormat,
  pluralRules,
  relativeTimeFormat,
} from "@/utils/intlCache";
import { formatDiscount, formatPrice } from "@/utils/formatPrice";
import { formatDisplayDate, formatLongDate } from "@/utils/localDate";
import { formatNumber, partsLabel } from "@/utils/enumLabels";
import { relativeDaysText } from "@/utils/wateringStats";

const LOCALES = ["de", "en"];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("intlCache", () => {
  it("returns the same instance per locale and options and distinct ones otherwise", () => {
    expect(numberFormat("de", { style: "percent" })).toBe(numberFormat("de", { style: "percent" }));
    expect(numberFormat("de", { style: "percent" })).not.toBe(
      numberFormat("en", { style: "percent" }),
    );
    expect(numberFormat("de")).not.toBe(numberFormat("de", { style: "percent" }));
    expect(collator("de")).toBe(collator("de"));
    expect(dateTimeFormat("en", { dateStyle: "long" })).toBe(
      dateTimeFormat("en", { dateStyle: "long" }),
    );
    expect(relativeTimeFormat("en", { numeric: "auto" })).toBe(
      relativeTimeFormat("en", { numeric: "auto" }),
    );
    expect(pluralRules("de")).toBe(pluralRules("de"));
  });

  it("constructs Intl.NumberFormat once per key across 1,000 calls", () => {
    const Original = Intl.NumberFormat;
    const spy = vi.fn();
    vi.spyOn(Intl, "NumberFormat").mockImplementation(function (
      ...args: ConstructorParameters<typeof Original>
    ) {
      spy();
      return new Original(...args);
    } as unknown as typeof Intl.NumberFormat);
    for (let i = 0; i < 1000; i++) {
      numberFormat("de-CH", { style: "currency", currency: "CHF" }).format(i);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 1000; i++) {
      numberFormat("de-CH", { style: "percent" }).format(i / 1000);
    }
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("keeps formatter output identical to direct Intl calls", () => {
    for (const locale of LOCALES) {
      const currency = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" });
      const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
      const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
      const short = new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const date = new Date(2026, 8, 4, 12);
      for (const value of [0, 1.5, 12.34, 1234567.891]) {
        expect(formatPrice(value, locale)).toBe(currency.format(value));
        expect(formatNumber(value, locale)).toBe(decimal.format(value));
      }
      expect(formatDiscount(5, 10, locale)).toBe(percent.format(-0.5));
      expect(formatDisplayDate(date, locale)).toBe(short.format(date));
      expect(formatLongDate(date, locale)).toBe(
        new Intl.DateTimeFormat(locale, { dateStyle: "long" })
          .format(date)
          .replace(/^(\d{1,2}\.?) /, "$1 "),
      );
      expect(relativeDaysText(0, locale)).toBe(relative.format(-0, "day"));
      expect(relativeDaysText(3, locale)).toBe(relative.format(-3, "day"));
      expect(relativeDaysText(21, locale)).toBe(relative.format(-3, "week"));
      expect(relativeDaysText(400, locale)).toBe(relative.format(-1, "year"));
      expect(partsLabel(1, locale)).toBe(partsLabel(1, locale));
      expect(pluralRules(locale).select(1)).toBe(new Intl.PluralRules(locale).select(1));
      expect(pluralRules(locale).select(0.5)).toBe(new Intl.PluralRules(locale).select(0.5));
      expect(dateTimeFormat(locale, { day: "numeric", month: "numeric" }).format(date)).toBe(
        date.toLocaleDateString(locale, { day: "numeric", month: "numeric" }),
      );
    }
  });

  it("orders text like localeCompare with numeric: true", () => {
    const names = [
      "Item 10",
      "item 2",
      "Äpfel",
      "Zebra",
      "apfel",
      "Item 1",
      "Östlich",
      "Ost",
      "b",
      "B",
    ];
    for (const locale of LOCALES) {
      const expected = [...names].sort((a, b) => a.localeCompare(b, locale, { numeric: true }));
      const actual = [...names].sort(compareText(locale, { numeric: true }));
      expect(actual).toEqual(expected);
      const plain = [...names].sort((a, b) => a.localeCompare(b, locale));
      expect([...names].sort(compareText(locale))).toEqual(plain);
      expect([...names].sort(collator(locale).compare)).toEqual(plain);
    }
  });
});
