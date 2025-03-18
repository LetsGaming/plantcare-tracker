import storageService from "@/services/general/StorageService";

const CATEGORY_STORAGE_KEY = "date_categories";
const DATE_STORAGE_KEY = "reminder_dates";

const getDeepCopy = <T>(data: T): T => JSON.parse(JSON.stringify(data));

export default class CalendarService {
  // Load categories from storage
  static async getCategories(): Promise<Category[]> {
    const categoriesStorage = (await storageService.get(
      CATEGORY_STORAGE_KEY
    )) as StoredCategories | null;
    return categoriesStorage?.categories || [];
  }

  // Save categories to storage
  static async saveCategories(categories: Category[]): Promise<void> {
    const plainCategories = getDeepCopy(categories);
    await storageService.set(CATEGORY_STORAGE_KEY, {
      categories: plainCategories,
    });
    this.dispatchCategoriesChanged(categories);
  }

  // Load reminder dates from storage
  static async getDates(): Promise<CalendarDates[]> {
    const datesStorage = (await storageService.get(
      DATE_STORAGE_KEY
    )) as StoredCalendarDates | null;
    return datesStorage?.calendarDates || [];
  }

  // Save reminder dates to storage
  static async saveDates(dates: CalendarDates[]): Promise<void> {
    const plainDates = getDeepCopy(dates);
    await storageService.set(DATE_STORAGE_KEY, { calendarDates: plainDates });
    this.dispatchDatesChanged(dates);
  }

  static async deleteOldDates(): Promise<void> {
    const doDelete = await storageService.get("delete_after_thirty");
    if (!doDelete) {
      return;
    }
    const dates = await this.getDates();
    const currentDate = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(currentDate.getDate() - 30);

    const filteredDates = dates.filter((dateEntry) => {
      const entryDate = new Date(dateEntry.date);
      return entryDate >= thirtyDaysAgo;
    });

    if (filteredDates.length !== dates.length) {
      await this.saveDates(filteredDates);
    }
  }

  static async getDeleteAfterThirty(): Promise<boolean> {
    const doDelete = await storageService.get("delete_after_thirty");
    return Boolean(doDelete) || false;
  }

  static async saveDeleteAfterThirty(doDelete: boolean): Promise<void> {
    await storageService.set("delete_after_thirty", doDelete);
  }

  static async getFirstDayOfWeek(): Promise<number> {
    const day = await storageService.get("first_day_of_week");
    return typeof day === "number" ? day : 0;
  }

  static async saveFirstDayOfWeek(day: number): Promise<void> {
    await storageService.set("first_day_of_week", day);
    this.dispatchFirstDayOfWeekChanged(day);
  }

  // Dispatch category changes event
  private static dispatchCategoriesChanged(categories: Category[]) {
    const event = new CustomEvent("categories-changed", { detail: categories });
    document.dispatchEvent(event);
  }

  // Dispatch date changes event
  private static dispatchDatesChanged(dates: CalendarDates[]) {
    const event = new CustomEvent("dates-changed", { detail: dates });
    document.dispatchEvent(event);
  }

  private static dispatchFirstDayOfWeekChanged(day: number) {
    const event = new CustomEvent("first-day-of-week-changed", { detail: day });
    document.dispatchEvent(event);
  }
}
