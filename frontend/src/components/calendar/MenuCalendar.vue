<template>
  <div>
    <Calendar
      title="calendar.menu.title"
      :show-settings-button="showSettingsButton"
      :show-edit-button="true"
      :dates="reminderDates"
      :popover-item="popoverItem"
      :is-popover-open="isPopoverOpen"
      @settings-click="$emit('settings-click')"
      @edit-click="onEditClick"
      @update-date="onDateSelected"
      @dismissed-popover="isPopoverOpen = false"
    />
  </div>

  <BaseFormModal
    :is-open="isModalOpen"
    :is-loading="isLoading"
    modal-title="calendar.reminder.add.title"
    form-title="calendar.reminder.form.title"
    submit-label="action.save"
    :form-data="formData"
    :form-fields="formFields"
    :delete-handler="onDeleteDate"
    @close="isModalOpen = false"
    @submit="submitHandler"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import CalendarService, { CalendarEvents } from "@/services/CalendarService";

export default defineComponent({
  name: "MenuCalendar",
  emits: ["settings-click"],
  components: {
    Calendar,
    BaseFormModal,
  },
  props: {
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
  },

  data() {
    return {
      selectedDate: "",
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
        {
          modelKey: "date",
          label: "calendar.reminder.form.date",
          type: "date",
          required: true,
        },
        {
          modelKey: "category",
          label: "calendar.reminder.form.category",
          type: "select",
          required: true,
          options: [] as { label: string; value: string }[],
        },
      ] as FormField[],
    };
  },

  async mounted() {
    this.attachListeners();
    await this.loadInitialState();
  },

  beforeUnmount() {
    this.detachListeners();
  },

  computed: {
    popoverItem(): PopoverItem | undefined {
      const item = this.reminderDates.find((d) => d.date === this.selectedDate);

      if (!item) return;

      return {
        title: `Erinnerung am ${item.date}`,
        fields: [
          { label: "Kategorie", value: item.category.name },
          { label: "Textfarbe", value: item.category.textColor },
          { label: "Hintergrund", value: item.category.backgroundColor },
        ],
      };
    },
  },

  methods: {
    /* =============================================================
       Lifecycle helpers
       ============================================================= */

    async loadInitialState() {
      this.reminderDates = await CalendarService.getDates();
      this.categories = await CalendarService.getCategories();
      this.syncCategoryOptions();
    },

    attachListeners() {
      document.addEventListener(
        CalendarEvents.DATES_CHANGED,
        this.onDatesChanged
      );
      document.addEventListener(
        CalendarEvents.CATEGORIES_CHANGED,
        this.onCategoriesChanged
      );
    },

    detachListeners() {
      document.removeEventListener(
        CalendarEvents.DATES_CHANGED,
        this.onDatesChanged
      );
      document.removeEventListener(
        CalendarEvents.CATEGORIES_CHANGED,
        this.onCategoriesChanged
      );
    },

    /* =============================================================
       Event handlers
       ============================================================= */

    onDatesChanged(event: Event) {
      const e = event as CustomEvent<CalendarDates[]>;
      this.reminderDates = e.detail;
    },

    onCategoriesChanged(event: Event) {
      const e = event as CustomEvent<Category[]>;
      this.categories = e.detail;
      this.syncCategoryOptions();
    },

    /* =============================================================
       UI interactions
       ============================================================= */

    onDateSelected(date: string) {
      const normalized = date.split("T")[0];
      const existing = this.reminderDates.find((d) => d.date === normalized);

      if (existing) {
        this.selectedDate = normalized;
        this.isPopoverOpen = true;
        return;
      }

      if (this.selectedDate === normalized) {
        this.formData = {
          date: new Date(normalized).getTime(),
          category: null,
        };
        this.isModalOpen = true;
      }

      this.isPopoverOpen = false;
      this.selectedDate = normalized;
    },

    onEditClick() {
      const existing = this.reminderDates.find(
        (d) => d.date === this.selectedDate
      );
      if (!existing) return;

      this.formData = {
        date: new Date(existing.date).getTime(),
        category: existing.category.name,
      };

      this.isModalOpen = true;
    },

    /* =============================================================
       Persistence
       ============================================================= */

    async submitHandler() {
      this.isLoading = true;

      try {
        const category = this.categories.find(
          (c) => c.name === this.formData.category
        );
        if (!category || !this.formData.date) return;

        const dateIso = new Date(this.formData.date)
          .toISOString()
          .split("T")[0];

        const updated = this.reminderDates.filter((d) => d.date !== dateIso);

        updated.push({
          date: dateIso,
          category: {
            name: category.name,
            textColor: category.textColor,
            backgroundColor: category.backgroundColor,
          },
        });

        await CalendarService.saveDates(updated);
        this.isModalOpen = false;
      } finally {
        this.isLoading = false;
      }
    },

    async onDeleteDate() {
      if (!this.formData.date) return;

      const updated = this.reminderDates.filter(
        (d) => new Date(d.date).getTime() !== this.formData.date
      );

      await CalendarService.saveDates(updated);
      this.isModalOpen = false;
    },

    /* =============================================================
       Helpers
       ============================================================= */

    syncCategoryOptions() {
      const field = this.formFields.find(
        (f) => f.modelKey === "category" && f.type === "select"
      ) as SelectField | undefined;

      if (!field) return;

      field.options = this.categories.map((c) => ({
        label: c.name,
        value: c.name,
      }));
    },
  },
});
</script>
