<template>
  <ion-card>
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Wässerungen</ion-title>
        <ion-icon
          v-if="showAddButton && !isGuest"
          :icon="addCircle"
          slot="end"
          @click="showAddingModal = true"
        />
      </ion-toolbar>
    </ion-card-header>

    <!-- Letzte Wässerungen -->
    <section v-if="mappedRecords.length > 0" class="watering-records">
      <ion-card-header>
        <ion-card-title class="record-title">
          Letzte Wässerung:
          <span v-if="daysAgo < 0">Unbekannt</span>
          <span v-if="daysAgo === 0">Heute</span>
          <span v-else>{{ daysAgo }} Tage her</span>
        </ion-card-title>
        <!-- Durchschnitts-Statistiken -->
        <section
          v-if="records.length > 0"
          class="watering-stats"
          style="padding: 0 16px"
        >
          <ion-card-subtitle>
            Wässerung:
            <strong>{{ averageWateringFrequency }}</strong>
          </ion-card-subtitle>
          <ion-card-subtitle>
            Düngergabe:
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
          @dissmised-popover="showPopover = false"
        />
      </ion-card-content>
    </section>

    <!-- Adding Modal -->
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

    <!-- Editing Modal -->
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
import {
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonIcon,
} from "@ionic/vue";
import { addCircle } from "ionicons/icons";

import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";

import WateringService from "@/services/WateringService";
import UserService from "@/services/UserService";
import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "WateringRecords",
  emits: ["add-record"],
  components: {
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonIcon,
    BaseFormModal,
    Calendar,
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
      records: [] as WateringRecord[],
      mappedRecords: [] as CalendarDates[],
      wateringCategories: [] as Category[],
      daysAgo: 0,
      selectedDate: null as string | null,
      selectedRecord: null as WateringRecord | null,

      showPopover: false,
      showAddingModal: false,
      showEditingModal: false,
      isGuest: false,
      isLoading: false,

      fertilizerOptions: [] as { label: string; value: number }[],

      addingRecord: this.emptyRecord(),
      editWateringRecord: this.emptyRecord(),
    };
  },
  async mounted() {
    this.isGuest = await UserService.isGuest();
    this.wateringCategories = await CalendarService.getWateringCategories();

    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = [
      ...types.map((t) => ({ label: t.name, value: t.id })),
      { label: "Kein Dünger", value: -1 },
    ];

    await this.setRecords();
  },
  computed: {
    popoverInfo(): PopoverItem | undefined {
      if (!this.selectedRecord) return;
      const { date_millis, usedFertilizer, fertilizerType } =
        this.selectedRecord;
      const fields = [
        { label: "Datum", value: new Date(date_millis).toLocaleDateString() },
        { label: "Dünger verwendet", value: usedFertilizer ? "Ja" : "Nein" },
      ];
      if (usedFertilizer && fertilizerType) {
        fields.push({ label: "Dünger Typ", value: fertilizerType });
      }
      return { title: "Wässerungsdetails", fields };
    },
    averageWateringFrequency(): string {
      if (this.records.length < 2) return "zu wenig Daten";

      const sorted = [...this.records].sort(
        (a, b) => a.date_millis - b.date_millis
      );

      // Calculate all differences in days
      const dayDiffs = [];
      for (let i = 1; i < sorted.length; i++) {
        const diffDays =
          (sorted[i].date_millis - sorted[i - 1].date_millis) / 86400000;
        dayDiffs.push(diffDays);
      }

      // Compute the average difference
      const avgDays = dayDiffs.reduce((a, b) => a + b, 0) / dayDiffs.length;

      // Determine frequency unit
      if (avgDays < 7) {
        return `ca. alle ${Math.round(avgDays)} Tage`;
      }
      if (avgDays < 30) {
        const weeks = Math.round(avgDays / 7);
        return `ca. alle ${weeks} Wochen`;
      }
      if (avgDays < 90) {
        const months = Math.round(avgDays / 30);
        return `ca. alle ${months} Monate`;
      }

      const years = Math.round(avgDays / 365);
      return `ca. alle ${years} Jahre`;
    },
    averageFertilizerUsage(): string {
      if (this.records.length === 0) return "keine Daten";

      const usedCount = this.records.filter((r) => r.usedFertilizer).length;
      const total = this.records.length;
      const ratio = usedCount / total;

      // Define thresholds and corresponding translation keys
      if (ratio === 1) return "jede Wässerung";
      if (ratio >= 0.75) return "meistens";
      if (ratio >= 0.5) return "ungefähr jede zweite";
      if (ratio >= 0.25) return "gelegentlich";
      if (ratio > 0) return "selten";

      return "nie";
    },
  },
  watch: {
    "addingRecord.fertilizerTypeId"(newVal) {
      this.syncFertilizerUsage(this.addingRecord, newVal);
    },
    selectedRecord(newRecord) {
      if (newRecord) {
        this.editWateringRecord = {
          date: newRecord.date_millis,
          usedFertilizer: newRecord.usedFertilizer,
          fertilizerTypeId: newRecord.fertilizerTypeId ?? -1,
        };
      }
    },
  },
  methods: {
    emptyRecord(): AddWateringRecord | EditWateringRecord {
      return { date: undefined, usedFertilizer: false, fertilizerTypeId: -1 };
    },
    syncFertilizerUsage(
      record: AddWateringRecord | EditWateringRecord,
      typeId?: number
    ) {
      if (typeId === -1 || !typeId) {
        record.fertilizerTypeId = undefined;
        record.usedFertilizer = false;
      } else {
        record.usedFertilizer = true;
      }
    },
    formFields(mode: "add" | "edit"): FormField[] {
      return [
        {
          label: "Datum",
          type: "date" as const,
          modelKey: "date",
          defaultValue:
            mode === "add" ? this.selectedDate ?? undefined : undefined,
        },
        {
          type: "radio" as const,
          modelKey: "fertilizerTypeId",
          label: "Düngertyp",
          options: this.fertilizerOptions,
          defaultValue:
            mode === "edit"
              ? this.editWateringRecord.fertilizerTypeId ?? -1
              : -1,
        },
      ];
    },
    async setRecords() {
      try {
        this.records = await WateringService.getWateringRecords(this.plantId);
        if (!this.records.length) {
          this.mappedRecords = [];
          this.daysAgo = 0;
          return;
        }
        const latestMillis = Math.max(
          ...this.records.map((r) => r.date_millis)
        );
        const latest = this.records.find((r) => r.date_millis === latestMillis);

        this.daysAgo = latest
          ? Math.floor(
              (Date.now() - new Date(latest.date_millis).getTime()) / 86400000
            )
          : -1;
        this.mappedRecords = this.mapWateringsToCalendar(this.records);
      } catch (error) {
        console.error("Failed to fetch records", error);
      }
    },
    onDateChange(date: string) {
      const normalized = date.split("T")[0];
      this.selectedRecord =
        this.records.find(
          (r) =>
            new Date(r.date_millis).toISOString().split("T")[0] === normalized
        ) || null;

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
      this.prepareAndSaveRecord(record, "add");
    },
    async editRecord(record: EditWateringRecord) {
      if (!this.selectedRecord?.id) return;
      this.prepareAndSaveRecord(record, "edit", this.selectedRecord.id);
    },
    async deleteRecord() {
      if (!this.selectedRecord?.id) return;
      this.startLoading();
      const response = await WateringService.deleteWateringRecord(
        this.plantId,
        this.selectedRecord.id
      );
      if (response) {
        this.showEditingModal = false;
        await this.setRecords();
      }
    },
    async prepareAndSaveRecord(
      record: AddWateringRecord | EditWateringRecord,
      mode: "add" | "edit",
      recordId?: number
    ) {
      this.startLoading();
      this.syncFertilizerUsage(record, record.fertilizerTypeId);
      const payload = { ...record };
      let response;

      if (mode === "add") {
        response = await WateringService.addWateringRecord(
          this.plantId,
          payload
        );
        if (response) this.showAddingModal = false;
      } else if (mode === "edit" && recordId) {
        response = await WateringService.editWateringRecord(
          this.plantId,
          recordId,
          payload
        );
        if (response) this.showEditingModal = false;
      }
      if (response) await this.setRecords();
    },
    startLoading() {
      this.isLoading = true;
      setTimeout(() => (this.isLoading = false), 10000);
    },
    mapWateringsToCalendar(records: WateringRecord[]): CalendarDates[] {
      return records.map((r, index) => {
        let category: Category | undefined;

        if (!r.usedFertilizer) {
          category = this.wateringCategories.find(
            (c) => String(c.name) === "Kein Dünger"
          );
        } else if (r.fertilizerType) {
          category = this.wateringCategories.find(
            (c) => String(c.name) === String(r.fertilizerType)
          );
        }

        // Ensure category is always defined
        if (!category) {
          category = this.wateringCategories.find(
            (c) => String(c.name) === "Kein Dünger"
          );
        }

        // If still not found, throw error or use a default Category object
        if (!category) {
          throw new Error("No valid watering category found for record.");
        }

        const isoDate = new Date(r.date_millis).toISOString().split("T")[0];

        return {
          date: isoDate,
          category,
        };
      });
    },
  },
});
</script>
