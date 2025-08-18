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

    <section v-if="mappedRecords.length" class="watering-records">
      <ion-card-header>
        <ion-card-title class="record-title">
          Letzte Wässerung:
          <span>{{ daysAgo < 1 ? "Heute" : `Vor ${daysAgo} Tagen` }}</span>
        </ion-card-title>
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
  IonCardContent,
  IonIcon,
} from "@ionic/vue";
import { addCircle } from "ionicons/icons";

import Calendar from "@/components/calendar/Calendar.vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";

import WateringService from "@/services/WateringService";
import UserService from "@/services/UserService";

export default defineComponent({
  name: "WateringRecords",
  emits: ["add-record"],
  components: {
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardHeader,
    IonCardTitle,
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
    await this.setRecords();

    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = [
      ...types.map((t) => ({ label: t.name, value: t.id })),
      { label: "Kein Dünger", value: -1 },
    ];
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
        const latest = this.records[0];
        this.daysAgo = Math.floor(
          (Date.now() - new Date(latest.date_millis).getTime()) / 86400000
        );
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
      const payload = { ...record }; // shallow copy
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
      return records.map((r) => ({
        date: new Date(r.date_millis).toISOString().split("T")[0],
        category: {
          name: "Wässerung",
          textColor: "#fff",
          backgroundColor: "#4CAF50",
        },
      }));
    },
  },
});
</script>
