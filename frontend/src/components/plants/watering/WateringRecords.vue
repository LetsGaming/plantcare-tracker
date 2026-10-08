<template>
  <section class="records" :aria-labelledby="headingId">
    <div class="records-head">
      <h2 :id="headingId" class="records-title">{{ t("plantdetail.calendar_title") }}</h2>
      <ion-button v-if="canAdd" size="small" fill="outline" @click="openAdd()">
        <ion-icon :icon="add" slot="start" aria-hidden="true" />
        {{ t("plantdetail.add_watering") }}
      </ion-button>
    </div>

    <p v-if="records.length > 0" class="fertilizer-stat">
      {{ t("watering.records.fertilizer_usage") }}:
      <strong>{{ averageFertilizerUsage }}</strong>
    </p>

    <div v-if="records.length === 0" class="empty">
      <p class="empty-title">{{ t("plantdetail.no_records_title") }}</p>
      <p v-if="canAdd" class="empty-message">{{ t("plantdetail.no_records_message") }}</p>
    </div>

    <Calendar
      v-if="records.length > 0 || canAdd"
      marker-mode="watering"
      :dates="mappedRecords"
      :show-edit-button="showEditButton"
      :is-popover-open="showPopover"
      :popover-item="popoverInfo"
      @update-date="onDateChange"
      @edit-click="openEdit"
      @dismissed-popover="showPopover = false"
    />

    <p v-if="canAdd" class="hint">{{ t("plantdetail.double_tap_hint") }}</p>

    <watering-record-modal
      :is-open="showModal"
      :mode="modalMode"
      :initial-day="modalDay"
      :record="modalMode === 'edit' ? selectedRecord : null"
      :fertilizer-options="fertilizerOptions"
      :pending="isSaving"
      @close="closeModal"
      @submit="submitDraft"
      @delete="deleteSelected"
    />
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapState } from "pinia";
import { IonButton, IonIcon } from "@ionic/vue";
import { add } from "ionicons/icons";

import Calendar from "@/components/calendar/Calendar.vue";
import WateringRecordModal, {
  WateringDraft,
} from "@/components/plants/watering/WateringRecordModal.vue";

import { useSessionStore } from "@/stores/session";
import { useWateringStore } from "@/stores/watering";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import { toDayKey } from "@/utils/localDate";

const NO_FERTILIZER_CATEGORY = "watering.category.no_fertilizer";
const FERTILIZER_CATEGORY = "watering.category.organic";
const TOAST_MS = 6000;

let recordsCount = 0;

export default defineComponent({
  name: "WateringRecords",
  components: {
    IonButton,
    IonIcon,
    Calendar,
    WateringRecordModal,
  },
  props: {
    plantId: { type: Number, required: true },
    showAddButton: { type: Boolean, default: true },
    showEditButton: { type: Boolean, default: true },
  },
  setup() {
    return { add };
  },
  data() {
    return {
      selectedDate: null as string | null,
      selectedRecord: null as WateringRecord | null,

      showPopover: false,
      showModal: false,
      modalMode: "add" as "add" | "edit",
      modalDay: "",
      isSaving: false,
      headingId: `watering-records-${++recordsCount}`,
    };
  },
  async mounted() {
    try {
      await Promise.all([this.ensureFertilizerTypes(), this.ensureRecords(this.plantId)]);
    } catch (error) {
      console.error("Failed to load watering data:", error);
    }
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
    ...mapState(useWateringStore, ["recordsFor", "fertilizerTypes"]),
    canAdd(): boolean {
      return this.showAddButton && !this.isGuest;
    },
    /** This plant's records, straight from the store so every update repaints. */
    records(): WateringRecord[] {
      return this.recordsFor(this.plantId);
    },
    mappedRecords(): CalendarDates[] {
      return this.records.map((record) => ({
        date: toDayKey(record.date_millis),
        category: {
          name: record.usedFertilizer ? FERTILIZER_CATEGORY : NO_FERTILIZER_CATEGORY,
          textColor: "",
          backgroundColor: "",
        },
      }));
    },
    fertilizerOptions(): { label: string; value: number }[] {
      return [
        {
          label: this.t("watering.records.no_fertilizer"),
          value: -1,
        },
        ...this.fertilizerTypes.map((type) => ({ label: type.name, value: type.id })),
      ];
    },
    popoverInfo(): PopoverItem | undefined {
      if (!this.selectedRecord) return;

      const record = this.selectedRecord;
      const fields: PopoverField[] = [
        {
          label: this.t("watering.records.date"),
          value: new Date(record.date_millis).toLocaleDateString(localizationService.getLocale()),
        },
        {
          label: this.t("watering.records.fertilizer_used"),
          value: record.usedFertilizer ? this.t("common.yes") : this.t("common.no"),
        },
      ];

      if (record.usedFertilizer && record.fertilizerType) {
        fields.push({
          label: this.t("watering.records.fertilizer_type"),
          value: this.t(record.fertilizerType),
        });
      }

      return { title: this.t("watering.records.details"), fields };
    },
    averageFertilizerUsage(): string {
      if (!this.records.length) return this.t("watering.records.no_data");

      const ratio = this.records.filter((r) => r.usedFertilizer).length / this.records.length;

      if (ratio === 1) return this.t("watering.records.fertilizer_usage.every_time");
      if (ratio >= 0.75) return this.t("watering.records.fertilizer_usage.mostly");
      if (ratio >= 0.5) return this.t("watering.records.fertilizer_usage.about_every_second");
      if (ratio >= 0.25) return this.t("watering.records.fertilizer_usage.occasional");
      if (ratio > 0) return this.t("watering.records.fertilizer_usage.rarely");
      return this.t("watering.records.fertilizer_usage.never");
    },
  },
  methods: {
    ...mapActions(useWateringStore, {
      ensureRecords: "ensureRecords",
      ensureFertilizerTypes: "ensureFertilizerTypes",
      createRecord: "addRecord",
      updateRecord: "editRecord",
      removeRecord: "deleteRecord",
    }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },

    /** Opens the add form; also called by the parent's "add with details" action. */
    openAdd(day = "") {
      if (!this.canAdd) return;
      this.modalMode = "add";
      this.modalDay = day;
      this.showModal = true;
    },
    openEdit() {
      if (!this.selectedRecord) return;
      this.showPopover = false;
      this.modalMode = "edit";
      this.showModal = true;
    },
    closeModal() {
      if (this.isSaving) return;
      this.showModal = false;
    },

    onDateChange(day: string) {
      this.selectedRecord =
        this.records.find((record) => toDayKey(record.date_millis) === day) ?? null;
      this.showPopover = !!this.selectedRecord;

      if (!this.selectedRecord && this.selectedDate === day) this.openAdd(day);

      this.selectedDate = day;
    },

    toPayload(draft: WateringDraft): AddWateringRecord {
      return {
        date: draft.date,
        usedFertilizer: draft.fertilizerTypeId !== undefined,
        fertilizerTypeId: draft.fertilizerTypeId,
      };
    },

    async submitDraft(draft: WateringDraft) {
      if (this.isSaving) return;
      const payload = this.toPayload(draft);
      const editing = this.modalMode === "edit" ? this.selectedRecord : null;

      this.isSaving = true;
      try {
        if (editing) {
          await this.updateRecord(this.plantId, editing.id, payload);
          ToastService.showSuccess({ key: "plantdetail.record_updated" });
        } else {
          const created = await this.createRecord(this.plantId, payload);
          ToastService.showToastWithAction(
            { key: "plantdetail.record_saved" },
            this.t("plantdetail.undo"),
            () => void this.undoCreate(created.id),
            TOAST_MS,
          );
        }
        this.isSaving = false;
        this.showModal = false;
      } catch (error) {
        console.error("Saving the watering failed:", error);
        this.isSaving = false;
        ToastService.showToastWithAction(
          { key: "plantdetail.save_failed" },
          this.t("toast.retry"),
          () => void this.submitDraft(draft),
          TOAST_MS,
        );
      }
    },

    async undoCreate(recordId: number) {
      try {
        await this.removeRecord(this.plantId, recordId);
        ToastService.showSuccess({ key: "plantdetail.undone" });
      } catch (error) {
        console.error("Undo watering failed:", error);
      }
    },

    async deleteSelected() {
      const record = this.selectedRecord;
      if (!record || this.isSaving) return;

      this.isSaving = true;
      try {
        await this.removeRecord(this.plantId, record.id);
        this.isSaving = false;
        this.showModal = false;
        this.selectedRecord = null;
        ToastService.showToastWithAction(
          { key: "plantdetail.record_deleted" },
          this.t("plantdetail.undo"),
          () => void this.restore(record),
          TOAST_MS,
        );
      } catch (error) {
        console.error("Deleting the watering failed:", error);
        this.isSaving = false;
        ToastService.showToastWithAction(
          { key: "plantdetail.delete_failed" },
          this.t("toast.retry"),
          () => void this.deleteSelected(),
          TOAST_MS,
        );
      }
    },

    async restore(record: WateringRecord) {
      try {
        await this.createRecord(this.plantId, {
          date: record.date_millis,
          usedFertilizer: record.usedFertilizer,
          fertilizerTypeId: record.fertilizerTypeId,
        });
        ToastService.showSuccess({ key: "plantdetail.record_restored" });
      } catch (error) {
        console.error("Restoring the watering failed:", error);
      }
    },
  },
});
</script>

<style scoped>
.records {
  display: grid;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}

.records-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.records-title {
  font-size: var(--text-lg);
}

.fertilizer-stat,
.hint,
.empty-message {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.empty-title {
  margin: 0;
  font-weight: 600;
}

.hint {
  font-size: var(--text-xs);
}
</style>
