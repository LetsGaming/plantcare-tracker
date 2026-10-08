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
    :modal-title="isEditing ? 'calendar2.reminder_edit_title' : 'calendar.reminder.add.title'"
    form-title="calendar.reminder.form.title"
    submit-label="action.save"
    :form-data="formData"
    :form-fields="formFields"
    :delete-handler="isEditing ? onDeleteDate : undefined"
    :delete-label="deleteLabel"
    @close="isModalOpen = false"
    @submit="submitHandler"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import { mapActions, mapState } from "pinia";
import { useCalendarStore } from "@/stores/calendar";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

const pad = (value: number) => String(value).padStart(2, "0");

/** Local calendar day of a timestamp as yyyy-MM-dd, the key reminders are stored under. */
const dayKey = (millis: number): string => {
  const date = new Date(millis);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Local midnight of a yyyy-MM-dd key. */
const keyToMillis = (key: string): number => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
};

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

      isPopoverOpen: false,
      isModalOpen: false,
      isEditing: false,
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
          mode: "date",
          required: true,
        },
        {
          modelKey: "category",
          label: "calendar.reminder.form.category",
          type: "select",
          required: true,
          hint: "",
          options: [] as { label: string; value: string }[],
        },
      ] as FormField[],
    };
  },

  async mounted() {
    await this.ensureCalendarLoaded();
    this.syncCategoryOptions();
  },

  watch: {
    categories() {
      this.syncCategoryOptions();
    },
  },

  computed: {
    ...mapState(useCalendarStore, { reminderDates: "dates", categories: "categories" }),
    popoverItem(): PopoverItem | undefined {
      const item = this.reminderDates.find((d) => d.date === this.selectedDate);

      if (!item) return;

      return {
        title: this.t("calendar2.reminder_on", { date: item.date }),
        fields: [
          { label: this.t("calendar2.category"), value: item.category.name },
          { label: this.t("calendar2.text_color"), value: item.category.textColor },
          { label: this.t("calendar2.background"), value: item.category.backgroundColor },
        ],
      };
    },
    deleteLabel(): string {
      return this.formData.date ? dayKey(this.formData.date) : "";
    },
  },

  methods: {
    ...mapActions(useCalendarStore, {
      ensureCalendarLoaded: "ensureLoaded",
      saveDates: "saveDates",
    }),

    t(key: string, vars?: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },

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
          date: keyToMillis(normalized),
          category: null,
        };
        this.isEditing = false;
        this.isModalOpen = true;
      }

      this.isPopoverOpen = false;
      this.selectedDate = normalized;
    },

    onEditClick() {
      const existing = this.reminderDates.find((d) => d.date === this.selectedDate);
      if (!existing) return;

      this.formData = {
        date: keyToMillis(existing.date),
        category: existing.category.name,
      };

      this.isPopoverOpen = false;
      this.isEditing = true;
      this.isModalOpen = true;
    },

    submitHandler() {
      const category = this.categories.find((c) => c.name === this.formData.category);
      if (!category || !this.formData.date) {
        ToastService.showError({
          key: "calendar2.reminder_incomplete",
          fallback: "Choose a date and a category first.",
        });
        return;
      }

      this.isLoading = true;
      try {
        const dateKey = dayKey(this.formData.date);
        const updated = this.reminderDates.filter((d) => d.date !== dateKey);
        updated.push({
          date: dateKey,
          category: {
            name: category.name,
            textColor: category.textColor,
            backgroundColor: category.backgroundColor,
          },
        });

        this.saveDates(updated);
        this.isModalOpen = false;
        ToastService.showSuccess({ key: "calendar2.reminder_saved", fallback: "Reminder saved." });
      } catch {
        ToastService.showError({
          key: "calendar2.reminder_save_failed",
          fallback: "The reminder could not be saved.",
        });
      } finally {
        this.isLoading = false;
      }
    },

    onDeleteDate() {
      if (!this.formData.date) return;
      const dateKey = dayKey(this.formData.date);
      const previous = this.reminderDates;

      this.saveDates(previous.filter((d) => d.date !== dateKey));
      this.isModalOpen = false;
      ToastService.showToastWithAction(
        { key: "calendar2.reminder_deleted", fallback: "Reminder deleted." },
        localizationService.t("toast2.undo", undefined, "Undo"),
        () => this.saveDates(previous),
      );
    },

    /* =============================================================
       Helpers
       ============================================================= */

    syncCategoryOptions() {
      const field = this.formFields.find(
        (f) => f.modelKey === "category" && f.type === "select",
      ) as SelectField | undefined;

      if (!field) return;

      field.options = this.categories.map((c) => ({
        label: c.name,
        value: c.name,
      }));
      field.hint = this.categories.length === 0 ? "calendar2.no_categories" : "";
    },
  },
});
</script>
