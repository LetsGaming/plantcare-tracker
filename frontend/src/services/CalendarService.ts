import { BaseService } from "./base/BaseService";
import storageService from "@/services/general/StorageService";

/* =========================================================================
   Defaults
   ========================================================================= */

const DEFAULT_WATERING_CATEGORIES: Category[] = [
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
  {
    name: "watering.category.no_fertilizer",
    textColor: "#ffffff",
    backgroundColor: "#1E90FF",
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
 *
 * Architectural principles:
 * - Storage is the single source of truth
 * - All writes go through saveAndNotify
 * - Defaults are derived views, never silently persisted
 * - Consumers subscribe to events instead of polling
 */
export default class CalendarService extends BaseService {
  /* =========================================================================
     Category helpers
     ========================================================================= */

  private static async getStoredCategories(
    key: StorageKeys
  ): Promise<Category[]> {
    const stored = await storageService.get<{ categories: Category[] }>(key);
    return stored?.categories || [];
  }

  private static async saveCategoriesInternal(
    key: StorageKeys,
    event: CalendarEvents,
    categories: Category[]
  ): Promise<void> {
    await this.saveAndNotify(key, event, categories);
  }

  /* =========================================================================
     Categories
     ========================================================================= */

  static async getCategories(): Promise<Category[]> {
    return this.getStoredCategories(StorageKeys.CATEGORIES);
  }

  static async saveCategories(categories: Category[]): Promise<void> {
    await this.saveCategoriesInternal(
      StorageKeys.CATEGORIES,
      CalendarEvents.CATEGORIES_CHANGED,
      categories
    );
  }

  /* =========================================================================
     Watering categories
     ========================================================================= */

  static async getWateringCategories(): Promise<Category[]> {
    const categories = await this.getStoredCategories(
      StorageKeys.WATERING_CATEGORIES
    );

    return categories.length ? categories : DEFAULT_WATERING_CATEGORIES;
  }

  static async saveWateringCategories(categories: Category[]): Promise<void> {
    await this.saveCategoriesInternal(
      StorageKeys.WATERING_CATEGORIES,
      CalendarEvents.WATERING_CATEGORIES_CHANGED,
      categories
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
    const stored = await storageService.get<{
      calendarDates: CalendarDates[];
    }>(StorageKeys.DATES);

    return stored?.calendarDates || [];
  }

  static async saveDates(dates: CalendarDates[]): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DATES,
      CalendarEvents.DATES_CHANGED,
      dates
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
    return Boolean(await storageService.get(StorageKeys.DELETE_AFTER_THIRTY));
  }

  static async saveDeleteAfterThirty(value: boolean): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DELETE_AFTER_THIRTY,
      CalendarEvents.DELETE_AFTER_THIRTY_CHANGED,
      value
    );
  }

  static async getFirstDayOfWeek(): Promise<number> {
    const stored = await storageService.get<number>(
      StorageKeys.FIRST_DAY_OF_WEEK
    );

    return typeof stored === "number" ? stored : 1;
  }

  static async saveFirstDayOfWeek(day: number): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.FIRST_DAY_OF_WEEK,
      CalendarEvents.FIRST_DAY_OF_WEEK_CHANGED,
      day
    );
  }
}
