import { DateTime } from "luxon";
import { modalController } from "@ionic/vue";
import config from "@/config.json";

/** Environment identifiers for configuration mapping */
type Environment = "development" | "production";

/** * Static Environment Constants
 * Pre-computing these at module load time avoids repeated lookups and logic
 * during the application's runtime hot-paths.
 */
const ENV: Environment =
  import.meta.env.MODE === "production" ? "production" : "development";
const ACTIVE_CONFIG = config[ENV];

/** Pre-computed API URL to avoid repeated string concatenation */
const API_URL = (() => {
  const { server } = ACTIVE_CONFIG;
  const port = "port" in server ? `:${server.port}` : "";
  return `${server.base_url}${port}${server.base_path}${server.api_version}`;
})();

/** Pre-computed expiry threshold in milliseconds */
const CACHE_EXPIRY_MS = ACTIVE_CONFIG.storage.expire_h * 60 * 60 * 1000;

/**
 * Internal helper for high-performance date parsing.
 * Luxon's fromISO natively detects 'Z' suffixes; toLocal() ensures the transition.
 * @param {string} dateString - ISO 8601 date string.
 * @returns {DateTime}
 */
const getLocalDate = (dateString: string): DateTime => {
  return DateTime.fromISO(dateString).toLocal();
};

/**
 * Global Utility Service
 * Provides optimized helper functions for configuration, date manipulation, and UI control.
 */
const Utils = {
  /**
   * Retrieves the environment-specific configuration object.
   * @returns {typeof ACTIVE_CONFIG} The active configuration segment.
   */
  getConfig() {
    return ACTIVE_CONFIG;
  },

  /**
   * Returns the application title defined in the configuration.
   * @returns {string}
   */
  getAppTitle(): string {
    return ACTIVE_CONFIG.frontend.app_title;
  },

  /**
   * Returns the pre-computed API Base URL.
   * Optimized: Performs zero logic or string concatenation when called.
   * @returns {string}
   */
  getApiBaseUrl(): string {
    return API_URL;
  },

  /**
   * Determines if a specific timestamp has exceeded the cache lifetime.
   * Optimized: Uses pre-computed millisecond constants.
   * @param {number} timestamp - Epoch milliseconds to check.
   * @returns {boolean} True if the cache is considered stale.
   */
  isCacheExpired(timestamp: number): boolean {
    return Date.now() - timestamp > CACHE_EXPIRY_MS;
  },

  /**
   * High-performance array filter for search queries.
   * Optimized: Replaced Object.values() with for...in to eliminate
   * unnecessary array allocations during the filtering loop.
   * @template T
   * @param {string} query - The search query.
   * @param {T[]} toFilter - The array of objects to filter.
   * @returns {T[]} The filtered subset.
   */
  baseSearchFilter<T extends object>(query: string, toFilter: T[]): T[] {
    if (!query || !toFilter?.length) return toFilter;

    const lowerQuery = query.trim().toLowerCase();
    if (!lowerQuery) return toFilter;

    return toFilter.filter((item) => {
      // Manual iteration is significantly faster than Object.values().some()
      // as it avoids creating a new array on every single item.
      for (const key in item) {
        const value = item[key];
        if (
          typeof value === "string" &&
          value.toLowerCase().includes(lowerQuery)
        ) {
          return true;
        }
      }
      return false;
    });
  },

  /**
   * Converts epoch time to a human-readable local format.
   * Handles both seconds and milliseconds automatically.
   * @param {number} epoch - Epoch time to convert.
   * @returns {string} Formatted date (e.g., "Tuesday, March 24, 2026").
   */
  convertDateMillis(epoch: number): string {
    if (typeof epoch !== "number" || isNaN(epoch)) {
      return String(epoch);
    }

    // Heuristic: If the number is too small to be ms in the modern era,
    // it is likely seconds. (1e12 is approx Sept 2001)
    const isSeconds = epoch < 1000000000000;
    const dateMillis = isSeconds ? epoch * 1000 : epoch;

    const localDate = DateTime.fromMillis(dateMillis);

    return localDate.isValid
      ? localDate.toLocaleString(DateTime.DATE_HUGE)
      : String(epoch);
  },

  /**
   * Converts various date formats to epoch milliseconds in local time.
   * Handles ISO strings, Date objects, and numbers (auto-detecting s vs. ms).
   * @param {string | number | Date} input - The date representation to convert.
   * @returns {number} Epoch milliseconds.
   */
  convertToMillis(input: string | number | Date): number {
    // 1. Handle Date Objects
    if (input instanceof Date) {
      return input.getTime();
    }

    // 2. Handle Numbers (Epochs)
    if (typeof input === "number") {
      if (isNaN(input)) return 0;

      // Heuristic: If the number is too small (< 1e12), it's likely seconds.
      // 1,000,000,000,000 ms is approx Sept 2001.
      return input < 1000000000000 ? input * 1000 : input;
    }

    // 3. Handle Strings (ISO or Numeric Strings)
    if (typeof input === "string") {
      // Check if the string is just a number (e.g., "1711280332")
      if (/^\d+$/.test(input)) {
        return this.convertToMillis(Number(input));
      }

      // Use Luxon (getLocalDate) for ISO strings
      const dt = getLocalDate(input);
      return dt.isValid ? dt.toMillis() : 0;
    }

    return 0;
  },

  /**
   * Capitalizes only the first letter of a string.
   * @param {string} str - Target string.
   * @returns {string}
   */
  capitalizeFirstLetter(str: string): string {
    if (!str) return "";
    return str[0].toUpperCase() + str.slice(1);
  },

  /**
   * Standard debounce to limit function execution frequency.
   * @template F
   * @param {F} fn - Target function.
   * @param {number} delay - Delay in milliseconds.
   */
  debounce<F extends (...args: any[]) => any>(fn: F, delay: number) {
    let timeout: number | undefined;
    return (...args: Parameters<F>) => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => fn(...args), delay);
    };
  },

  /**
   * Closes the active top-most Ionic modal.
   * @returns {Promise<void>}
   */
  async closeOpenModal(): Promise<void> {
    const topModal = await modalController.getTop();
    if (topModal) {
      await modalController.dismiss();
    }
  },

  /**
   * Recursively dismisses all currently open Ionic modals.
   * @returns {Promise<void>}
   */
  async closeAllOpenModals(): Promise<void> {
    let topModal = await modalController.getTop();
    while (topModal) {
      await modalController.dismiss();
      topModal = await modalController.getTop();
    }
  },
};

export default Utils;
