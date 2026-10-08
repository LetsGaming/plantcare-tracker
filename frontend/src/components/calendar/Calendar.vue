<template>
  <div class="calendar">
    <div v-if="title || showSettingsButton" class="calendar-title-row">
      <h3 v-if="title" class="calendar-title">{{ t(title) }}</h3>
      <icon-button
        v-if="showSettingsButton"
        class="calendar-settings"
        :icon="settings"
        :label="t('calendar.settings.title')"
        @press="$emit('settings-click')"
      />
    </div>

    <div class="calendar-nav">
      <icon-button :icon="chevronBack" :label="t('a11y.previous_month')" @press="goToMonth(-1)" />
      <h3 class="calendar-month" aria-live="polite">{{ monthLabel }}</h3>
      <icon-button :icon="chevronForward" :label="t('a11y.next_month')" @press="goToMonth(1)" />
    </div>

    <table class="calendar-grid" role="grid" :aria-label="monthLabel">
      <thead>
        <tr>
          <th v-for="weekday in weekdays" :key="weekday.index" scope="col" :abbr="weekday.long">
            {{ weekday.short }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(week, weekIndex) in weeks" :key="weekIndex">
          <td v-for="(cell, cellIndex) in week" :key="cellIndex">
            <button
              v-if="cell"
              type="button"
              class="day"
              :class="cell.classes"
              :style="cell.style"
              :data-day="cell.key"
              :tabindex="cell.key === focusKey ? 0 : -1"
              :aria-label="cell.label"
              :aria-pressed="cell.key === selectedDate"
              :aria-current="cell.isToday ? 'date' : undefined"
              @click="selectDay(cell.key, $event)"
              @keydown="onKeydown($event, cell.key)"
            >
              <span class="day-number">{{ cell.day }}</span>
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <calendar-legend v-if="legendItems.length > 0" :legend-items="legendItems" />

    <Popover
      :event="changedEvent"
      :is-open="isPopoverOpen"
      :show-edit-button="showEditButton"
      :title="popoverItem ? popoverItem.title : 'Details'"
      :fields="
        popoverItem?.fields
          ? popoverItem.fields
          : [
              {
                label: 'Date',
                value: selectedDateText,
              },
            ]
      "
      @dismiss="$emit('dismissed-popover')"
      @edit-click="$emit('edit-click', popoverItem)"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { chevronBack, chevronForward, settings } from "ionicons/icons";
import { mapActions, mapState } from "pinia";
import Popover from "@/components/Popover.vue";
import IconButton from "@/components/ui/IconButton.vue";
import { useCalendarStore } from "@/stores/calendar";
import CalendarLegend from "./CalendarLegend.vue";
import localizationService from "@/services/general/LocalizationService";
import { formatDisplayDate, parseDayKey, toDayKey } from "@/utils/localDate";

const NO_FERTILIZER_CATEGORY = "watering.category.no_fertilizer";

type MarkerKind = "water" | "fertilizer" | "custom";

interface DayCell {
  key: string;
  day: number;
  isToday: boolean;
  label: string;
  classes: Record<string, boolean>;
  style: Record<string, string> | undefined;
}

export default defineComponent({
  name: "Calendar",
  emits: ["settings-click", "update-date", "dismissed-popover", "edit-click"],
  components: {
    Popover,
    IconButton,
    CalendarLegend,
  },
  props: {
    title: {
      type: String,
      required: false,
    },
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    dates: {
      type: Array as () => CalendarDates[],
      default: () => [],
    },
    isPopoverOpen: {
      type: Boolean,
      default: false,
    },
    popoverItem: {
      type: Object as () => PopoverItem | undefined,
      required: false,
    },
    /**
     * "watering" draws watered days as a filled water marker and fertilized days
     * as a clay ring; "category" paints each day in its category's own colors.
     */
    markerMode: {
      type: String as PropType<"category" | "watering">,
      default: "category",
    },
  },
  data() {
    const now = new Date();
    return {
      viewYear: now.getFullYear(),
      viewMonth: now.getMonth(),
      selectedDate: "",
      changedEvent: null as Event | null,
    };
  },
  setup() {
    return { chevronBack, chevronForward, settings };
  },
  async mounted() {
    await this.ensureCalendarLoaded();
  },
  computed: {
    ...mapState(useCalendarStore, ["firstDayOfWeek"]),
    locale(): string {
      return localizationService.getLocale();
    },
    selectedDateText(): string {
      return this.selectedDate ? formatDisplayDate(this.selectedDate, this.locale) : "";
    },
    todayKey(): string {
      return toDayKey(Date.now());
    },
    monthLabel(): string {
      return new Intl.DateTimeFormat(this.locale, { month: "long", year: "numeric" }).format(
        new Date(this.viewYear, this.viewMonth, 1),
      );
    },
    weekdays(): { index: number; short: string; long: string }[] {
      const short = new Intl.DateTimeFormat(this.locale, { weekday: "short" });
      const long = new Intl.DateTimeFormat(this.locale, { weekday: "long" });
      // 2024-01-07 is a Sunday
      return Array.from({ length: 7 }, (_, offset) => {
        const index = (this.firstDayOfWeek + offset) % 7;
        const reference = new Date(2024, 0, 7 + index);
        return { index, short: short.format(reference), long: long.format(reference) };
      });
    },
    datesByDay(): Map<string, CalendarDates[]> {
      const byDay = new Map<string, CalendarDates[]>();
      for (const entry of this.dates) {
        const key = entry.date.slice(0, 10);
        byDay.set(key, [...(byDay.get(key) ?? []), entry]);
      }
      return byDay;
    },
    focusKey(): string {
      const inView = (key: string) => {
        const parts = parseDayKey(key);
        return !!parts && parts.year === this.viewYear && parts.month - 1 === this.viewMonth;
      };
      if (this.selectedDate && inView(this.selectedDate)) return this.selectedDate;
      if (inView(this.todayKey)) return this.todayKey;
      return toDayKey(new Date(this.viewYear, this.viewMonth, 1));
    },
    weeks(): (DayCell | null)[][] {
      const first = new Date(this.viewYear, this.viewMonth, 1);
      const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
      const lead = (first.getDay() - this.firstDayOfWeek + 7) % 7;
      const dateLabel = new Intl.DateTimeFormat(this.locale, { dateStyle: "full" });

      const cells: (DayCell | null)[] = Array.from({ length: lead }, () => null);
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(this.viewYear, this.viewMonth, day);
        cells.push(this.buildCell(toDayKey(date), day, dateLabel.format(date)));
      }
      while (cells.length % 7 !== 0) cells.push(null);

      const weeks: (DayCell | null)[][] = [];
      for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
      return weeks;
    },
    legendItems(): { label: string; color: string; shape: "fill" | "ring" | "today" }[] {
      if (this.markerMode === "watering") {
        return [
          { label: "plantdetail.legend_watered", color: "var(--water)", shape: "fill" },
          {
            label: "plantdetail.legend_fertilized",
            color: "var(--ion-color-secondary)",
            shape: "ring",
          },
          { label: "plantdetail.legend_today", color: "var(--ion-text-color)", shape: "today" },
        ];
      }

      const seen = new Set<string>();
      return this.dates
        .map((entry) => ({
          label: entry.category.name,
          color: entry.category.backgroundColor,
          shape: "fill" as const,
        }))
        .filter((item) => {
          if (seen.has(item.label)) return false;
          seen.add(item.label);
          return true;
        });
    },
  },
  methods: {
    ...mapActions(useCalendarStore, { ensureCalendarLoaded: "ensureLoaded" }),
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    markerKind(entries: CalendarDates[]): MarkerKind | null {
      if (entries.length === 0) return null;
      if (this.markerMode !== "watering") return "custom";
      return entries.some((entry) => entry.category.name !== NO_FERTILIZER_CATEGORY)
        ? "fertilizer"
        : "water";
    },
    buildCell(key: string, day: number, dateText: string): DayCell {
      const entries = this.datesByDay.get(key) ?? [];
      const kind = this.markerKind(entries);
      const isToday = key === this.todayKey;
      const custom = kind === "custom" ? entries[0].category : null;

      let label = dateText;
      if (kind === "water") label = this.tVars("plantdetail.day_watered", { date: dateText });
      else if (kind === "fertilizer")
        label = this.tVars("plantdetail.day_fertilized", { date: dateText });
      else if (custom)
        label = this.tVars("plantdetail.day_marked", {
          date: dateText,
          label: this.t(custom.name),
        });
      else if (isToday) label = this.tVars("plantdetail.day_today", { date: dateText });

      return {
        key,
        day,
        isToday,
        label,
        classes: {
          "is-today": isToday,
          "is-selected": key === this.selectedDate,
          "is-water": kind === "water",
          "is-fertilizer": kind === "fertilizer",
          "is-custom": kind === "custom",
        },
        style: custom
          ? { "--marker-bg": custom.backgroundColor, "--marker-fg": custom.textColor }
          : undefined,
      };
    },
    tVars(key: string, vars: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },
    goToMonth(delta: number) {
      const target = new Date(this.viewYear, this.viewMonth + delta, 1);
      this.viewYear = target.getFullYear();
      this.viewMonth = target.getMonth();
    },
    selectDay(key: string, event: Event) {
      this.changedEvent = event;
      this.selectedDate = key;
      this.$emit("update-date", key);
    },
    onKeydown(event: KeyboardEvent, key: string) {
      const steps: Record<string, number> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      const parts = parseDayKey(key);
      if (!parts) return;

      let target: Date | null = null;
      if (event.key in steps) {
        target = new Date(parts.year, parts.month - 1, parts.day + steps[event.key]);
      } else if (event.key === "PageUp" || event.key === "PageDown") {
        const delta = event.key === "PageUp" ? -1 : 1;
        target = new Date(parts.year, parts.month - 1 + delta, parts.day);
      }
      if (!target) return;

      event.preventDefault();
      this.viewYear = target.getFullYear();
      this.viewMonth = target.getMonth();
      const targetKey = toDayKey(target);
      this.selectedDate = targetKey;
      this.$nextTick(() => {
        const button = this.$el.querySelector(`[data-day="${targetKey}"]`) as HTMLElement | null;
        button?.focus();
      });
    },
  },
});
</script>

<style scoped>
.calendar {
  width: 100%;
  box-sizing: border-box;
}

.calendar-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: 0 var(--space-2) var(--space-2);
}

.calendar-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.calendar-month {
  font-size: var(--text-lg);
  text-transform: capitalize;
  text-align: center;
}

.calendar-grid {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}

.calendar-grid th {
  padding: var(--space-1) 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ink-soft);
  text-align: center;
}

.calendar-grid td {
  padding: 0;
  text-align: center;
}

.day {
  display: grid;
  place-items: center;
  width: 100%;
  min-height: var(--tap-min);
  padding: 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--ion-text-color);
  font: inherit;
  font-size: var(--text-sm);
  cursor: pointer;
}

.day:hover {
  background: var(--surface-sunken);
}

.day.is-selected {
  background: var(--surface-sunken);
}

.day.is-today {
  box-shadow: inset 0 0 0 2px var(--ion-text-color);
  font-weight: 700;
}

.day-number {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  box-sizing: border-box;
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
}

.is-water .day-number {
  background: var(--water);
  color: var(--ion-color-tertiary-contrast);
  font-weight: 700;
}

.is-fertilizer .day-number {
  border: 3px solid var(--ion-color-secondary);
  font-weight: 700;
}

.is-custom .day-number {
  background: var(--marker-bg);
  color: var(--marker-fg);
  font-weight: 700;
}
</style>
