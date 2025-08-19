import storageService from "@/services/general/StorageService";

const getDeepCopy = <T>(data: T): T => JSON.parse(JSON.stringify(data));

// Default watering categories
const DEFAULT_WATERING_CATEGORIES: Category[] = [
  { name: "Organisch", textColor: "#ffffff", backgroundColor: "#8B4513" },
  { name: "Mineralisch", textColor: "#ffffff", backgroundColor: "#228B22" },
  { name: "Kein Dünger", textColor: "#ffffff", backgroundColor: "#1E90FF" },
];

// --- ENUMS ---
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

export default class CalendarService {
  // --- NORMAL CATEGORIES ---
  static async getCategories(): Promise<Category[]> {
    const categoriesStorage = (await storageService.get(
      StorageKeys.CATEGORIES
    )) as StoredCategories | null;
    return categoriesStorage?.categories || [];
  }

  static async saveCategories(categories: Category[]): Promise<void> {
    const plainCategories = getDeepCopy(categories);
    await storageService.set(StorageKeys.CATEGORIES, {
      categories: plainCategories,
    });
    this.dispatchCategoriesChanged(categories);
  }

  // --- WATERING CATEGORIES ---
  static async getWateringCategories(): Promise<Category[]> {
    const stored = (await storageService.get(
      StorageKeys.WATERING_CATEGORIES
    )) as StoredCategories | null;

    if (!stored?.categories?.length) {
      return DEFAULT_WATERING_CATEGORIES;
    }

    return stored.categories;
  }

  static async saveWateringCategories(categories: Category[]): Promise<void> {
    const plainCategories = getDeepCopy(categories);
    await storageService.set(StorageKeys.WATERING_CATEGORIES, {
      categories: plainCategories,
    });
    this.dispatchWateringCategoriesChanged(categories);
  }

  static async resetWateringCategories(): Promise<void> {
    await this.saveWateringCategories(DEFAULT_WATERING_CATEGORIES);
  }

  // --- REMINDER DATES ---
  static async getDates(): Promise<CalendarDates[]> {
    const datesStorage = (await storageService.get(
      StorageKeys.DATES
    )) as StoredCalendarDates | null;
    return datesStorage?.calendarDates || [];
  }

  static async saveDates(dates: CalendarDates[]): Promise<void> {
    const plainDates = getDeepCopy(dates);
    await storageService.set(StorageKeys.DATES, { calendarDates: plainDates });
    this.dispatchDatesChanged(dates);
  }

  static async deleteOldDates(): Promise<void> {
    const doDelete = await this.getDeleteAfterThirty();
    if (!doDelete) return;

    const dates = await this.getDates();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(new Date().getDate() - 30);

    const filteredDates = dates.filter(
      (dateEntry) => new Date(dateEntry.date) >= thirtyDaysAgo
    );

    if (filteredDates.length !== dates.length) {
      await this.saveDates(filteredDates);
    }
  }

  static async getDeleteAfterThirty(): Promise<boolean> {
    const doDelete = await storageService.get(StorageKeys.DELETE_AFTER_THIRTY);
    return Boolean(doDelete) || false;
  }

  static async saveDeleteAfterThirty(doDelete: boolean): Promise<void> {
    await storageService.set(StorageKeys.DELETE_AFTER_THIRTY, doDelete);
    this.dispatchDeleteAfterThirtyChanged(doDelete);
  }

  static async getFirstDayOfWeek(): Promise<number> {
    const day = await storageService.get(StorageKeys.FIRST_DAY_OF_WEEK);
    return typeof day === "number" ? day : 1; // Default to Monday
  }

  static async saveFirstDayOfWeek(day: number): Promise<void> {
    await storageService.set(StorageKeys.FIRST_DAY_OF_WEEK, day);
    this.dispatchFirstDayOfWeekChanged(day);
  }

  // --- DISPATCHERS ---
  private static dispatchCategoriesChanged(categories: Category[]) {
    document.dispatchEvent(
      new CustomEvent(CalendarEvents.CATEGORIES_CHANGED, { detail: categories })
    );
  }

  private static dispatchWateringCategoriesChanged(categories: Category[]) {
    document.dispatchEvent(
      new CustomEvent(CalendarEvents.WATERING_CATEGORIES_CHANGED, {
        detail: categories,
      })
    );
  }

  private static dispatchDatesChanged(dates: CalendarDates[]) {
    document.dispatchEvent(
      new CustomEvent(CalendarEvents.DATES_CHANGED, { detail: dates })
    );
  }

  private static dispatchFirstDayOfWeekChanged(day: number) {
    document.dispatchEvent(
      new CustomEvent(CalendarEvents.FIRST_DAY_OF_WEEK_CHANGED, { detail: day })
    );
  }

  private static dispatchDeleteAfterThirtyChanged(doDelete: boolean) {
    document.dispatchEvent(
      new CustomEvent(CalendarEvents.DELETE_AFTER_THIRTY_CHANGED, {
        detail: doDelete,
      })
    );
  }
}
