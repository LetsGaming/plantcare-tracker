<template>
  <ion-card>
    <ion-card-header>
      <ion-toolbar>
        <ion-title>
          {{ t("watering.records.title", {}, "Wässerungsaufzeichnungen") }}
        </ion-title>
        <ion-icon
          v-if="showAddButton && !isGuest"
          :icon="addCircle"
          slot="end"
          @click="showAddingModal = true"
        />
      </ion-toolbar>
    </ion-card-header>

    <section v-if="mappedRecords.length > 0" class="watering-records">
      <ion-card-header>
        <ion-card-title class="record-title">
          {{ t("watering.records.last_watering", {}, "Letzte Wässerung") }}:
          <span v-if="daysAgo < 0">
            {{ t("watering.records.unknown", {}, "Unbekannt") }}
          </span>
          <span v-else-if="daysAgo === 0">
            {{ t("watering.records.today", {}, "Heute") }}
          </span>
          <span v-else> {{ daysAgo }} {{ t("watering.records.days_ago", {}, "Tage her") }} </span>
        </ion-card-title>

        <section v-if="records.length > 0" class="watering-stats" style="padding: 0 16px">
          <ion-card-subtitle>
            {{ t("watering.records.watering", {}, "Wässerung") }}:
            <strong>{{ averageWateringFrequency }}</strong>
          </ion-card-subtitle>
          <ion-card-subtitle>
            {{ t("watering.records.fertilizer_usage", {}, "Düngergabe") }}:
            <strong>{{ averageFertilizerUsage }}</strong>
          </ion-card-subtitle>
        </section>
      </ion-card-header>

      <ion-card-content class="align-middle record-details">
        <Calendar
          :dates="mappedRecords"
          :show-edit-button="showEditButton"
          :is-popover-open="showPopover"
          :popover-item="popoverInfo"
          @update-date="onDateChange"
          @edit-click="handleEditClick"
          @dismissed-popover="showPopover = false"
        />
      </ion-card-content>
    </section>

    <ion-card-content v-else class="align-middle">
      <ion-text color="medium">{{
        t("watering.records.no_data", {}, "Keine Aufzeichnungen vorhanden")
      }}</ion-text>
    </ion-card-content>

    <BaseFormModal
      v-if="showAddingModal"
      :is-open="showAddingModal"
      :is-loading="isLoading"
      modal-title="Wässerung hinzufügen"
      form-title="Wässerung hinzufügen"
      submit-label="Hinzufügen"
      :form-data="addingRecord"
      :form-fields="formFields('add')"
      @close="showAddingModal = false"
      @submit="addRecord"
    />

    <BaseFormModal
      v-if="showEditingModal && selectedRecord"
      :is-open="showEditingModal"
      :is-loading="isLoading"
      modal-title="Wässerung bearbeiten"
      form-title="Wässerungsinformationen"
      submit-label="Wässerung editieren"
      :form-data="editWateringRecord"
      :form-fields="formFields('edit')"
      :deleteHandler="deleteRecord"
      @close="showEditingModal = false"
      @submit="editRecord"
    />
  </ion-card>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapState } from "pinia";
import {
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonIcon,
  IonText,
} from "@ionic/vue";
import { addCircle } from "ionicons/icons";

import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";

import { useSessionStore } from "@/stores/session";
import { useWateringStore } from "@/stores/watering";
import CalendarService from "@/services/CalendarService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "WateringRecords",
  components: {
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonIcon,
    IonText,
    Calendar,
    BaseFormModal,
  },
  props: {
    plantId: { type: Number, required: true },
    showAddButton: { type: Boolean, default: true },
    showEditButton: { type: Boolean, default: true },
  },
  setup() {
    return { addCircle };
  },
  data() {
    return {
      wateringCategories: [] as Category[],

      selectedDate: null as string | null,
      selectedRecord: null as WateringRecord | null,

      showPopover: false,
      showAddingModal: false,
      showEditingModal: false,
      isLoading: false,

      addingRecord: {
        date: undefined,
        usedFertilizer: false,
        fertilizerTypeId: -1,
      } as AddWateringRecord,

      editWateringRecord: {
        date: undefined,
        usedFertilizer: false,
        fertilizerTypeId: -1,
      } as EditWateringRecord,
    };
  },
  async mounted() {
    this.isLoading = true;
    try {
      // Parallel loading to optimize speed while remaining safe
      const [categories] = await Promise.all([
        CalendarService.getWateringCategories(),
        this.ensureFertilizerTypes(),
        this.ensureRecords(this.plantId),
      ]);
      this.wateringCategories = categories || [];
    } catch (error) {
      console.error("Critical error in WateringRecords mounted:", error);
    } finally {
      this.isLoading = false;
    }
  },
  computed: {
    ...mapState(useSessionStore, ["isGuest"]),
    ...mapState(useWateringStore, ["recordsFor", "fertilizerTypes"]),
    /** This plant's records, straight from the store so every update repaints. */
    records(): WateringRecord[] {
      return this.recordsFor(this.plantId);
    },
    mappedRecords(): CalendarDates[] {
      return this.records.length === 0 ? [] : this.mapWateringsToCalendar(this.records);
    },
    daysAgo(): number {
      if (this.records.length === 0) return -1;
      const latest = Math.max(...this.records.map((r) => r.date_millis));
      return Math.floor((Date.now() - latest) / 86400000);
    },
    fertilizerOptions(): { label: string; value: number }[] {
      return [
        ...this.fertilizerTypes.map((t) => ({ label: t.name, value: t.id })),
        {
          label: this.t("watering.records.no_fertilizer", {}, "Kein Dünger"),
          value: -1,
        },
      ];
    },
    popoverInfo(): PopoverItem | undefined {
      if (!this.selectedRecord) return;

      const r = this.selectedRecord;
      const fields = [
        {
          label: this.t("watering.records.date", {}, "Datum"),
          value: new Date(r.date_millis).toLocaleDateString(),
        },
        {
          label: this.t("watering.records.fertilizer_used", {}, "Dünger verwendet"),
          value: r.usedFertilizer
            ? this.t("common.yes", {}, "Ja")
            : this.t("common.no", {}, "Nein"),
        },
      ];

      if (r.usedFertilizer && r.fertilizerType) {
        fields.push({
          label: this.t("watering.records.fertilizer_type", {}, "Düngertyp"),
          value: this.t(r.fertilizerType),
        });
      }

      return {
        title: this.t("watering.records.details", {}, "Wässerungsdetails"),
        fields,
      };
    },
    averageWateringFrequency(): string {
      if (this.records.length < 2) {
        return this.t("watering.records.not_enough_data", {}, "zu wenig Daten");
      }

      const sorted = [...this.records].sort((a, b) => a.date_millis - b.date_millis);
      const diffs = sorted
        .slice(1)
        .map((r, i) => (r.date_millis - sorted[i].date_millis) / 86400000);

      const avg = diffs.reduce((a, b) => a + b, 0) / diffs.length;

      if (avg < 7) {
        return this.t(
          "watering.records.frequency.days",
          { count: Math.round(avg) },
          "ca. alle {count} Tage",
        );
      }
      if (avg < 30) {
        return this.t(
          "watering.records.frequency.weeks",
          { count: Math.round(avg / 7) },
          "ca. alle {count} Wochen",
        );
      }
      if (avg < 90) {
        return this.t(
          "watering.records.frequency.months",
          { count: Math.round(avg / 30) },
          "ca. alle {count} Monate",
        );
      }
      return this.t(
        "watering.records.frequency.years",
        { count: Math.round(avg / 365) },
        "ca. alle {count} Jahre",
      );
    },
    averageFertilizerUsage(): string {
      if (!this.records.length) {
        return this.t("watering.records.no_data", {}, "keine Daten");
      }

      const ratio = this.records.filter((r) => r.usedFertilizer).length / this.records.length;

      if (ratio === 1)
        return this.t("watering.records.fertilizer_usage.every_time", {}, "jede Wässerung");
      if (ratio >= 0.75) return this.t("watering.records.fertilizer_usage.mostly", {}, "meistens");
      if (ratio >= 0.5)
        return this.t(
          "watering.records.fertilizer_usage.about_every_second",
          {},
          "ungefähr jede zweite",
        );
      if (ratio >= 0.25)
        return this.t("watering.records.fertilizer_usage.occasional", {}, "gelegentlich");
      if (ratio > 0) return this.t("watering.records.fertilizer_usage.rarely", {}, "selten");
      return this.t("watering.records.fertilizer_usage.never", {}, "nie");
    },
  },
  watch: {
    "addingRecord.fertilizerTypeId"(val) {
      this.syncFertilizerUsage(this.addingRecord, val);
    },
    selectedRecord(record) {
      if (!record) return;
      this.editWateringRecord = {
        date: record.date_millis,
        usedFertilizer: record.usedFertilizer,
        fertilizerTypeId: record.fertilizerTypeId ?? -1,
      };
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
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    syncFertilizerUsage(record: AddWateringRecord | EditWateringRecord, typeId?: number) {
      if (typeId === -1 || typeId === undefined) {
        record.usedFertilizer = false;
        record.fertilizerTypeId = undefined;
      } else {
        record.usedFertilizer = true;
      }
    },
    formFields(mode: "add" | "edit"): FormField[] {
      return [
        {
          label: this.t("watering.records.date", {}, "Datum"),
          type: "date",
          modelKey: "date",
          defaultValue: mode === "add" ? (this.selectedDate ?? undefined) : undefined,
        },
        {
          label: this.t("watering.records.fertilizer_type", {}, "Düngertyp"),
          type: "radio",
          modelKey: "fertilizerTypeId",
          options: this.fertilizerOptions,
          defaultValue: mode === "edit" ? (this.editWateringRecord.fertilizerTypeId ?? -1) : -1,
        },
      ];
    },
    onDateChange(date: string) {
      const day = date.split("T")[0];
      this.selectedRecord =
        this.records.find((r) => new Date(r.date_millis).toISOString().split("T")[0] === day) ??
        null;

      this.showPopover = !!this.selectedRecord;

      if (!this.selectedRecord && this.selectedDate === date) {
        this.addingRecord.date = new Date(date).getTime();
        this.showAddingModal = true;
      }

      this.selectedDate = date;
    },
    handleEditClick() {
      if (!this.selectedRecord) return;
      this.showPopover = false;
      this.showEditingModal = true;
    },
    async addRecord(record: AddWateringRecord) {
      await this.prepareAndSaveRecord(record, "add");
    },
    async editRecord(record: EditWateringRecord) {
      if (!this.selectedRecord?.id) return;
      await this.prepareAndSaveRecord(record, "edit", this.selectedRecord.id);
    },
    async deleteRecord() {
      if (!this.selectedRecord?.id) return;
      const recordId = this.selectedRecord.id;

      // Optimistic: the record is removed from the store immediately and
      // the calendar repaints from it, so close right away. On failure
      // handleRequest shows the toast and the rollback restores the record.
      this.showEditingModal = false;
      await this.removeRecord(this.plantId, recordId).catch(() => undefined);
    },
    async prepareAndSaveRecord(
      record: AddWateringRecord | EditWateringRecord,
      mode: "add" | "edit",
      id?: number,
    ) {
      this.syncFertilizerUsage(record, record.fertilizerTypeId ?? undefined);

      // Optimistic: the calendar repaints from the store before the request
      // settles, so close the modal immediately. Errors are already toasted
      // by handleRequest and rolled back by the store.
      if (mode === "add") {
        this.showAddingModal = false;
        await this.createRecord(this.plantId, record).catch(() => undefined);
      } else if (id) {
        this.showEditingModal = false;
        await this.updateRecord(this.plantId, id, record).catch(() => undefined);
      }
    },
    mapWateringsToCalendar(records: WateringRecord[]): CalendarDates[] {
      if (!this.wateringCategories.length) return [];

      const getCategoryForRecord = (record: WateringRecord) => {
        let category;

        if (!record.usedFertilizer) {
          // Default category for no fertilizer
          category = this.wateringCategories.find(
            (c) => c.name === "watering.category.no_fertilizer",
          );
        } else {
          // Use fertilizerTypeId as index
          category = this.wateringCategories[record.fertilizerTypeId || 0];
        }

        // Fallback if undefined
        if (!category) {
          category =
            this.wateringCategories.find((c) => c.name === "watering.category.organic") ||
            this.wateringCategories[0];
        }

        return category;
      };

      return records.map((record) => ({
        date: new Date(record.date_millis).toISOString().split("T")[0],
        category: getCategoryForRecord(record)!,
      }));
    },
  },
});
</script>
