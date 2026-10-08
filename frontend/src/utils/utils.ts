import { DateTime } from "luxon";
import { modalController } from "@ionic/vue";

/**
 * Settings come from `VITE_*` variables (see `.env.example`). Every one has a default, so a missing or
 * empty value never breaks the app.
 */
const isProduction = import.meta.env.MODE === "production";
const setting = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const API_URL = (
  setting(import.meta.env.VITE_API_URL) ||
  (isProduction
    ? "/api/v2"
    : `${window.location.protocol}//${window.location.hostname}:5000/api/v2`)
).replace(/\/+$/, "");

const APP_TITLE = setting(import.meta.env.VITE_APP_TITLE) || "Plantcare Tracker";

const configuredHours = Number(setting(import.meta.env.VITE_CACHE_EXPIRE_HOURS));
const CACHE_EXPIRY_HOURS =
  Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : isProduction ? 24 : 6;
const CACHE_EXPIRY_MS = CACHE_EXPIRY_HOURS * 60 * 60 * 1000;

/**
 * Safer universal date parser
 */
const toDateTime = (input: string | number | Date): DateTime => {
  if (input instanceof Date) {
    return DateTime.fromJSDate(input);
  }

  if (typeof input === "number") {
    if (isNaN(input)) return DateTime.invalid("NaN");

    // FIX: better threshold (avoids year 7357 bug)
    const millis = input < 1e11 ? input * 1000 : input;
    return DateTime.fromMillis(millis);
  }

  if (typeof input === "string") {
    if (/^\d+$/.test(input)) {
      return toDateTime(Number(input));
    }

    return DateTime.fromISO(input);
  }

  return DateTime.invalid("Unsupported input");
};

const Utils = {
  getAppTitle(): string {
    return APP_TITLE;
  },

  getApiBaseUrl(): string {
    return API_URL;
  },

  isCacheExpired(timestamp: number): boolean {
    return Date.now() - timestamp > CACHE_EXPIRY_MS;
  },

  baseSearchFilter<T extends object>(query: string, toFilter: T[]): T[] {
    if (!query || !toFilter?.length) return toFilter;

    const lowerQuery = query.trim().toLowerCase();
    if (!lowerQuery) return toFilter;

    return toFilter.filter((item) => {
      for (const key in item) {
        const value = item[key];
        if (typeof value === "string" && value.toLowerCase().includes(lowerQuery)) {
          return true;
        }
      }
      return false;
    });
  },

  /**
   * NEW: Flexible date converter
   */
  convertDate(input: string | number | Date, options?: { format?: "readable" | "iso" }): string {
    const dt = toDateTime(input);

    if (!dt.isValid) {
      return String(input);
    }

    if (options?.format === "iso") {
      return dt.toUTC().toISO() ?? String(input);
    }

    return dt.toLocaleString({ day: "2-digit", month: "2-digit", year: "numeric" });
  },

  /**
   * BACKWARD COMPAT: your original function
   */
  convertDateMillis(epoch: number): string {
    return this.convertDate(epoch, { format: "readable" });
  },

  convertToMillis(input: string | number | Date): number {
    const dt = toDateTime(input);
    return dt.isValid ? dt.toMillis() : 0;
  },

  capitalizeFirstLetter(str: string): string {
    if (!str) return "";
    return str[0].toUpperCase() + str.slice(1);
  },

  debounce<F extends (...args: any[]) => any>(fn: F, delay: number) {
    let timeout: number | undefined;
    return (...args: Parameters<F>) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), delay);
    };
  },

  async closeOpenModal(): Promise<void> {
    const topModal = await modalController.getTop();
    if (topModal) {
      await modalController.dismiss();
    }
  },

  /** Closes every open modal; gives up on one that stays open, so a busy modal cannot hang navigation. */
  async closeAllOpenModals(): Promise<void> {
    let topModal = await modalController.getTop();
    while (topModal) {
      const dismissed = await modalController.dismiss();
      const next = await modalController.getTop();
      if (dismissed === false || next === topModal) return;
      topModal = next;
    }
  },
};

export default Utils;
