<template>
  <div>
    <Calendar
      title="Erinnerungen"
      :show-settings-button="showSettingsButton"
      :show-edit-button="true"
      :dates="reminderDates"
      :popover-item="popoverItem"
      :is-popover-open="isPopoverOpen"
      @settings-click="$emit('settings-click')"
      @edit-click="onEditClick"
      @update-date="onDateSelected"
      @dissmised-popover="isPopoverOpen = false"
    />
  </div>

  <!-- BaseFormModal for adding/editing dates -->
  <BaseFormModal
    :is-open="isModalOpen"
    :is-loading="isLoading"
    modal-title="Neue Erinnerung hinzufügen"
    form-title="Erinnerung"
    submit-label="Speichern"
    :form-data="formData"
    :form-fields="formFields"
    :delete-handler="onDeleteDate"
    @close="isModalOpen = false"
    @submit="submitHandler"
  />
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

import CalendarService, { CalendarEvents } from "@/services/CalendarService";

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
    BaseFormModal,
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
      isModalOpen: false,
      isLoading: false,
      formData: {
        date: null as number | null,
        category: null as string | null,
      },
      formFields: [
        { modelKey: "date", label: "Datum", type: "date", required: true },
        {
          modelKey: "category",
          label: "Kategorie",
          type: "select",
          required: true,
          options: [] as { label: string; value: string }[],
        },
      ] as FormField[],
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
            { label: "Kategorie", value: item.category.name },
            { label: "Farbe", value: item.category.textColor },
            { label: "Hintergrundfarbe", value: item.category.backgroundColor },
          ],
        };
      }

      return undefined;
    },
  },
  methods: {
    setupListeners() {
      document.addEventListener(CalendarEvents.CATEGORIES_CHANGED, (event) => {
        const customEvent = event as CustomEvent<Category[]>;
        this.categories = customEvent.detail;
      });
      document.addEventListener(CalendarEvents.DATES_CHANGED, (event) => {
        const customEvent = event as CustomEvent<CalendarDates[]>;
        this.reminderDates = [];
        this.$nextTick(() => {
          this.reminderDates = customEvent.detail;
        });
      });
      document.addEventListener(
        CalendarEvents.DELETE_AFTER_THIRTY_CHANGED,
        (event) => {
          const customEvent = event as CustomEvent<boolean>;
          CalendarService.saveDeleteAfterThirty(customEvent.detail);
        }
      );
    },
    async getSavedDates() {
      this.reminderDates = await CalendarService.getDates();
    },
    async getSavedCategories() {
      this.categories = await CalendarService.getCategories();
    },
    onDateSelected(date: string) {
      const normalizedDate = date.split("T")[0];

      // find existing reminder
      const found = this.reminderDates.find(
        (reminder) => reminder.date === normalizedDate
      );

      if (found) {
        // existing reminder → show popover
        this.selectedDate = normalizedDate;
        this.selectedCategory = found.category;
        this.isPopoverOpen = true;
      } else {
        // no reminder
        this.selectedCategory = null;
        this.isPopoverOpen = false;

        // if same date clicked twice → show adding modal
        if (this.selectedDate === normalizedDate) {
          this.formData = {
            date: new Date(normalizedDate).getTime(),
            category: null,
          };

          // safely set select options
          const categoryField = this.formFields.find(
            (f) => f.modelKey === "category" && f.type === "select"
          ) as SelectField | undefined;

          if (categoryField) {
            categoryField.options = this.categories.map((c) => ({
              label: c.name,
              value: c.name,
            }));
          }

          this.isModalOpen = true;
        }

        // update selectedDate
        this.selectedDate = normalizedDate;
      }
    },
    onEditClick() {
      // open modal to edit selected date
      const found = this.reminderDates.find(
        (r) => r.date === this.selectedDate
      );
      if (found) {
        this.formData = {
          date: new Date(found.date).getTime(),
          category: found.category.name,
        };
        // safely set select options
        const categoryField = this.formFields.find(
          (f) => f.modelKey === "category" && f.type === "select"
        ) as SelectField | undefined;

        if (categoryField) {
          categoryField.options = this.categories.map((c) => ({
            label: c.name,
            value: c.name,
          }));
        }

        this.isModalOpen = true;
      }
    },
    async submitHandler() {
      this.isLoading = true;
      try {
        const category = this.categories.find(
          (c) => c.name === this.formData.category
        );
        if (!category) return;

        // check if updating existing
        const idx = this.reminderDates.findIndex(
          (r) => Number(r.date) === this.formData.date
        );
        if (idx >= 0) {
          this.reminderDates[idx] = {
            date: this.formData.date
              ? new Date(this.formData.date).toISOString().split("T")[0]
              : "",
            category,
          };
        } else {
          this.reminderDates.push({
            date: this.formData.date
              ? new Date(this.formData.date).toISOString().split("T")[0]
              : "",
            category,
          });
        }

        await this.saveDates();
        this.isModalOpen = false;
      } finally {
        this.isLoading = false;
      }
    },
    async onDeleteDate() {
      this.reminderDates = this.reminderDates.filter(
        (r) => new Date(r.date).getTime() !== this.formData.date
      );
      await this.saveDates();
      this.isModalOpen = false;
    },
    async saveDates() {
      await CalendarService.saveDates(this.reminderDates);
    },
  },
});
</script>
