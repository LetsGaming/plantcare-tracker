<template>
  <div>
    <Calendar 
      title="Erinnerungen"
      :show-settings-button="showSettingsButton"
      :dates="reminderDates"
      :popover-item="popoverItem"
      :is-popover-open="isPopoverOpen"
      @settings-click="$emit('settings-click')"
      @update-date="onDateSelected"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonIcon,
  IonToolbar,
} from "@ionic/vue";
import { settings } from "ionicons/icons";
import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "../modal/BaseFormModal.vue";

import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "MenuCalendar",
  emits: ["settings-click"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonIcon,
    IonToolbar,
    Calendar,
    BaseFormModal
  },
  props: {
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    return {
      settings,
    };
  },
  data() {
    return {
      selectedDate: "",
      selectedCategory: null as {
        name: string;
        textColor: string;
        backgroundColor: string;
      } | null,
      reminderDates: [] as CalendarDates[],
      categories: [] as Category[],
      isPopoverOpen: false,
    };
  },
  async mounted() {
    this.setupListeners();
    await this.getSavedDates();
    await this.getSavedCategories();
  },
  computed: {
    popoverItem(): PopoverItem | undefined {
      const item = this.reminderDates.find(
        (date) => date.date === this.selectedDate
      );

      if (item) {
        return {
          title: `Erinnerung am ${item.date}`,
          fields: [
            { label: "Kategorie", value: item.category },
            { label: "Farbe", value: item.textColor },
            { label: "Hintergrundfarbe", value: item.backgroundColor },
          ],
        };
      }

      return undefined;
    },
  },
  methods: {
    setupListeners() {
      document.addEventListener("categories-changed", (event) => {
        const customEvent = event as CustomEvent<Category[]>;
        this.categories = customEvent.detail;
      });
      document.addEventListener("dates-changed", (event) => {
        const customEvent = event as CustomEvent<CalendarDates[]>;
        this.reminderDates = [];
        this.$nextTick(() => {
          this.reminderDates = customEvent.detail;
        });
      });
    },
    async getSavedDates() {
      this.reminderDates = await CalendarService.getDates();
    },
    async getSavedCategories() {
      this.categories = await CalendarService.getCategories();
    },
    onDateSelected(date: string) {
      const normalizedDate = date.split("T")[0];

      const found = this.reminderDates.find(
        (reminder) => reminder.date === normalizedDate
      );

      if (found) {
        this.selectedDate = found.date;
        this.selectedCategory = {
          name: found.category,
          textColor: found.textColor,
          backgroundColor: found.backgroundColor,
        };
      } else {
        this.selectedDate = normalizedDate;
        this.selectedCategory = null;
      }
    },
    addDate() {
      if (!this.selectedDate || !this.selectedCategory) return;

      const dateWithoutTime = new Date(this.selectedDate)
        .toISOString()
        .split("T")[0];

      this.reminderDates.push({
        date: dateWithoutTime,
        category: this.selectedCategory.name,
        textColor: this.selectedCategory.textColor,
        backgroundColor: this.selectedCategory.backgroundColor,
      });

      this.selectedDate = "";
      this.saveDates();
    },
    async saveDates() {
      await CalendarService.saveDates(this.reminderDates);
    },
  },
});
</script>
