import { BaseService } from "./base/BaseService";
import storageService from "@/services/general/StorageService";

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

export default class CalendarService extends BaseService {
  // --- CATEGORIES ---
  static async getCategories(): Promise<Category[]> {
    const storage = await storageService.get<StoredCategories>(
      StorageKeys.CATEGORIES
    );
    return storage?.categories || [];
  }

  static async saveCategories(categories: Category[]): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.CATEGORIES,
      CalendarEvents.CATEGORIES_CHANGED,
      categories,
      "categories"
    );
  }

  // --- WATERING CATEGORIES ---
  static async getWateringCategories(): Promise<Category[]> {
    const stored = await storageService.get<StoredCategories>(
      StorageKeys.WATERING_CATEGORIES
    );
    return stored?.categories?.length
      ? stored.categories
      : DEFAULT_WATERING_CATEGORIES;
  }

  static async saveWateringCategories(categories: Category[]): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.WATERING_CATEGORIES,
      CalendarEvents.WATERING_CATEGORIES_CHANGED,
      categories,
      "categories"
    );
  }

  static async resetWateringCategories(): Promise<void> {
    await this.saveWateringCategories(DEFAULT_WATERING_CATEGORIES);
  }

  // --- REMINDER DATES ---
  static async getDates(): Promise<CalendarDates[]> {
    const storage = await storageService.get<StoredCalendarDates>(
      StorageKeys.DATES
    );
    return storage?.calendarDates || [];
  }

  static async saveDates(dates: CalendarDates[]): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DATES,
      CalendarEvents.DATES_CHANGED,
      dates,
      "calendarDates"
    );
  }

  static async deleteOldDates(): Promise<void> {
    const doDelete = await this.getDeleteAfterThirty();
    if (!doDelete) return;

    const dates = await this.getDates();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const filteredDates = dates.filter(
      (d) => new Date(d.date) >= thirtyDaysAgo
    );
    if (filteredDates.length !== dates.length)
      await this.saveDates(filteredDates);
  }

  // --- SETTINGS ---
  static async getDeleteAfterThirty(): Promise<boolean> {
    return !!(await storageService.get(StorageKeys.DELETE_AFTER_THIRTY));
  }

  static async saveDeleteAfterThirty(doDelete: boolean): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.DELETE_AFTER_THIRTY,
      CalendarEvents.DELETE_AFTER_THIRTY_CHANGED,
      doDelete
    );
  }

  static async getFirstDayOfWeek(): Promise<number> {
    const day = await storageService.get<number>(StorageKeys.FIRST_DAY_OF_WEEK);
    return typeof day === "number" ? day : 1;
  }

  static async saveFirstDayOfWeek(day: number): Promise<void> {
    await this.saveAndNotify(
      StorageKeys.FIRST_DAY_OF_WEEK,
      CalendarEvents.FIRST_DAY_OF_WEEK_CHANGED,
      day
    );
  }
}
