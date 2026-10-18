/**
 * stores/calendar.ts
 *
 * Local calendar settings: reminder dates, their categories, the watering
 * categories and display preferences. No network; everything survives logout
 * (keepOnClear) and never expires.
 */

import { defineStore } from "pinia";
import type { PersistEntry } from "./persistence";
import { WATERING_CATEGORY_NAMES } from "@/utils/wateringCategories";

const DEFAULT_WATERING_CATEGORIES: Category[] = WATERING_CATEGORY_NAMES.map((name) => ({ name, textColor: "", backgroundColor: "" }));

const LEGACY_DEFAULT_COLORS = new Set(["#1e90ff", "#8b4513", "#228b22"]);

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

const setting = (
  key: string,
  field: CalendarField,
  dirtyOn: readonly string[],
): PersistEntry<CalendarState> => ({
  key,
  keepOnClear: true,
  allowExpired: true,
  dirtyOn,
  // Serialized so an in-place edit followed by a save still counts as a change.
  version: (state) => JSON.stringify(state[field]),
  pick: (state) => state[field],
  apply: (state, data) => {
    Object.assign(state, { [field]: data });
  },
});

export const useCalendarStore = defineStore("calendar", {
  state: initialState,

  persist: {
    entries: [
      setting("date_categories", "categories", ["saveCategories"]),
      {
        ...setting("watering_categories", "wateringCategories", [
          "saveWateringCategories",
          "resetWateringCategories",
        ]),
        // An empty stored list means "never customized": keep the defaults.
        apply: (state, data: Category[]) => {
          if (data.length === 0) return;
          state.wateringCategories = data.map((category) =>
            LEGACY_DEFAULT_COLORS.has(category.backgroundColor?.toLowerCase() ?? "")
              ? { ...category, backgroundColor: "", textColor: "" }
              : category,
          );
        },
      },
      setting("reminder_dates", "dates", ["saveDates", "deleteOldDates"]),
      setting("delete_after_thirty", "deleteAfterThirty", ["saveDeleteAfterThirty"]),
      setting("first_day_of_week", "firstDayOfWeek", ["saveFirstDayOfWeek"]),
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
