/**
 * stores/calendar.ts
 *
 * Local calendar settings: reminder dates, their categories, the watering
 * categories and display preferences. No network; everything survives logout
 * (keepOnClear) and never expires.
 */

import { defineStore } from "pinia";
import type { PersistEntry } from "./persistence";

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

const defaultWateringCategories = (): Category[] =>
  DEFAULT_WATERING_CATEGORIES.map((category) => ({ ...category }));

type CalendarField =
  "categories" | "wateringCategories" | "dates" | "deleteAfterThirty" | "firstDayOfWeek";

const initialState = () => ({
  categories: [] as Category[],
  wateringCategories: defaultWateringCategories(),
  dates: [] as CalendarDates[],
  deleteAfterThirty: false,
  firstDayOfWeek: 1,
  loaded: false,
});

type CalendarState = ReturnType<typeof initialState>;

const setting = (key: string, field: CalendarField): PersistEntry<CalendarState> => ({
  key,
  keepOnClear: true,
  allowExpired: true,
  pick: (state) => state[field],
  apply: (state, data) => {
    Object.assign(state, { [field]: data });
  },
});

export const useCalendarStore = defineStore("calendar", {
  state: initialState,

  persist: {
    entries: [
      setting("date_categories", "categories"),
      {
        ...setting("watering_categories", "wateringCategories"),
        // An empty stored list means "never customized": keep the defaults.
        apply: (state, data: Category[]) => {
          if (data.length > 0) state.wateringCategories = data;
        },
      },
      setting("reminder_dates", "dates"),
      setting("delete_after_thirty", "deleteAfterThirty"),
      setting("first_day_of_week", "firstDayOfWeek"),
    ],
  },

  actions: {
    /** Loads the stored settings once. */
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return;
      await this.$hydrate();
      this.loaded = true;
    },

    saveCategories(categories: Category[]): void {
      this.categories = categories;
    },

    saveWateringCategories(categories: Category[]): void {
      this.wateringCategories = categories;
    },

    resetWateringCategories(): void {
      this.wateringCategories = defaultWateringCategories();
    },

    saveDates(dates: CalendarDates[]): void {
      this.dates = dates;
    },

    /** Drops reminders older than 30 days when the setting is on. */
    deleteOldDates(): void {
      if (!this.deleteAfterThirty) return;
      const threshold = new Date();
      threshold.setDate(threshold.getDate() - 30);
      const kept = this.dates.filter((d) => new Date(d.date) >= threshold);
      if (kept.length !== this.dates.length) this.dates = kept;
    },

    saveDeleteAfterThirty(value: boolean): void {
      this.deleteAfterThirty = value;
    },

    saveFirstDayOfWeek(day: number): void {
      this.firstDayOfWeek = day;
    },
  },
});
