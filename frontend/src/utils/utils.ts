import { DateTime } from "luxon";
import { modalController } from "@ionic/vue";
import config from "@/config.json";

/** Environment identifiers */
type Environment = "development" | "production";

const ENV: Environment =
  import.meta.env.MODE === "production" ? "production" : "development";

const ACTIVE_CONFIG = config[ENV];

/** Pre-computed API URL */
const API_URL = (() => {
  const { server } = ACTIVE_CONFIG;
  const port = "port" in server ? `:${server.port}` : "";
  return `${server.base_url}${port}${server.base_path}${server.api_version}`;
})();

/** Cache expiry */
const CACHE_EXPIRY_MS = ACTIVE_CONFIG.storage.expire_h * 60 * 60 * 1000;

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

const getLocalDate = (dateString: string): DateTime => {
  return DateTime.fromISO(dateString).toLocal();
};

const Utils = {
  getConfig() {
    return ACTIVE_CONFIG;
  },

  getAppTitle(): string {
    return ACTIVE_CONFIG.frontend.app_title;
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
   * NEW: Flexible date converter
   */
  convertDate(
    input: string | number | Date,
    options?: { format?: "readable" | "iso" }
  ): string {
    const dt = toDateTime(input);

    if (!dt.isValid) {
      return String(input);
    }

    if (options?.format === "iso") {
      return dt.toUTC().toISO() ?? String(input);
    }

    return dt.toLocaleString(DateTime.DATE_HUGE);
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

  async closeAllOpenModals(): Promise<void> {
    let topModal = await modalController.getTop();
    while (topModal) {
      await modalController.dismiss();
      topModal = await modalController.getTop();
    }
  },
};

export default Utils;