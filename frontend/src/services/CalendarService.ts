import { BaseService } from "./base/BaseService";
import storageService from "@/services/general/StorageService";

/* =========================================================================
    Defaults
   ========================================================================= */

const DEFAULT_WATERING_CATEGORIES: Category[] = [
  {
    name: "watering.category.no_fertilizer",
    textColor: "#ffffff",
    backgroundColor: "#1E90FF",
  },
  {
    name: "watering.category.organic",
    textColor: "#ffffff",
    backgroundColor: "#8B4513",
  },
  {
    name: "watering.category.mineral",
    textColor: "#ffffff",
    backgroundColor: "#228B22",
  },
];

/* =========================================================================
    Storage keys & events
   ========================================================================= */

export enum StorageKeys {
  CATEGORIES = "date_categories",
  WATERING_CATEGORIES = "watering_categories",
  DATES = "reminder_dates",
  DELETE_AFTER_THIRTY = "delete_after_thirty",
  FIRST_DAY_OF_WEEK = "first_day_of_week",
}

export enum CalendarEvents {
  CATEGORIES_CHANGED = "categories-changed",
  WATERING_CATEGORIES_CHANGED = "watering-categories-changed",
  DATES_CHANGED = "dates-changed",
  FIRST_DAY_OF_WEEK_CHANGED = "first-day-of-week-changed",
  DELETE_AFTER_THIRTY_CHANGED = "delete-after-thirty-changed",
}

/**
 * CalendarService
 *
 * Local entity-centric service for calendar-related state.
 */
export default class CalendarService extends BaseService {
  /* =========================================================================
      Category helpers
     ========================================================================= */

  /**
   * Internal helper to unwrap data from the new Storage format.
   * Matches the structure: { data: T, keepOnClear: boolean, timestamp: number }
   */
  private static async getStoredData<T>(
    key: StorageKeys,
    fallback: T,
  ): Promise<T> {
    const wrapped = await storageService.get<{ data: T }>(key);
    // If wrapped exists and has a .data property, return it. Otherwise fallback.
    return wrapped && Object.prototype.hasOwnProperty.call(wrapped, "data")
      ? wrapped.data
      : fallback;
  }

  private static async saveCategoriesInternal(
    key: StorageKeys,
    event: CalendarEvents,
    categories: Category[],
  ): Promise<void> {
    // We use "data" as the wrap key to keep things consistent across the app
    await this.saveAndNotify(key, event, categories, "data", true);
  }

  /* =========================================================================
      Categories
     ========================================================================= */

  static async getCategories(): Promise<Category[]> {
    return this.getStoredData<Category[]>(StorageKeys.CATEGORIES, []);
  }

  static async saveCategories(categories: Category[]): Promise<void> {
    await this.saveCategoriesInternal(
      StorageKeys.CATEGORIES,
      CalendarEvents.CATEGORIES_CHANGED,
      categories,
    );
  }

  /* =========================================================================
      Watering categories
     ========================================================================= */

  static async getWateringCategories(): Promise<Category[]> {
    // We use getCachedData here so multiple components loading the calendar
    // don't all hit the storage at the same time.
    return this.getCachedData(StorageKeys.WATERING_CATEGORIES, async () => {
      const categories = await this.getStoredData<Category[]>(
        StorageKeys.WATERING_CATEGORIES,
        [],
      );
      return categories.length ? categories : [...DEFAULT_WATERING_CATEGORIES];
    });
  }

  static async saveWateringCategories(categories: Category[]): Promise<void> {
    await this.saveCategoriesInternal(
      StorageKeys.WATERING_CATEGORIES,
      CalendarEvents.WATERING_CATEGORIES_CHANGED,
      categories,
    );
  }

  static async resetWateringCategories(): Promise<Category[]> {
    await this.saveWateringCategories(DEFAULT_WATERING_CATEGORIES);
    return DEFAULT_WATERING_CATEGORIES;
  }

  /* =========================================================================
      Reminder dates
     ========================================================================= */

  static async getDates(): Promise<CalendarDates[]> {
    return this.getStoredData<CalendarDates[]>(StorageKeys.DATES, []);
  }

  static async saveDates(dates: CalendarDates[]): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DATES,
      CalendarEvents.DATES_CHANGED,
      dates,
      "data",
      true,
    );
  }

  static async deleteOldDates(): Promise<void> {
    if (!(await this.getDeleteAfterThirty())) return;

    const dates = await this.getDates();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    const filtered = dates.filter((d) => new Date(d.date) >= threshold);

    if (filtered.length !== dates.length) {
      await this.saveDates(filtered);
    }
  }

  /* =========================================================================
      Settings
     ========================================================================= */

  static async getDeleteAfterThirty(): Promise<boolean> {
    const value = await this.getStoredData<boolean>(
      StorageKeys.DELETE_AFTER_THIRTY,
      false,
    );
    return !!value;
  }

  static async saveDeleteAfterThirty(value: boolean): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DELETE_AFTER_THIRTY,
      CalendarEvents.DELETE_AFTER_THIRTY_CHANGED,
      value,
      "data",
      true,
    );
  }

  static async getFirstDayOfWeek(): Promise<number> {
    return this.getStoredData<number>(StorageKeys.FIRST_DAY_OF_WEEK, 1);
  }

  static async saveFirstDayOfWeek(day: number): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.FIRST_DAY_OF_WEEK,
      CalendarEvents.FIRST_DAY_OF_WEEK_CHANGED,
      day,
      "data",
      true,
    );
  }
}
