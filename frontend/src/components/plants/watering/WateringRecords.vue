<template>
  <ion-card>
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Wässerungen</ion-title>
        <template v-if="showAddButton && !isGuest">
          <ion-icon
            :icon="addCircle"
            slot="end"
            @click="showAddingModal = true"
          />
        </template>
      </ion-toolbar>
    </ion-card-header>
    <section class="watering-records" v-if="mappedRecords.length > 0">
      <ion-card-header>
        <ion-card-title class="record-title">
          Letzte Wässerung: <span v-if="daysAgo < 1">Heute</span>
          <span v-else>Vor {{ daysAgo }} Tagen</span>
        </ion-card-title>
      </ion-card-header>
      <ion-card-content class="align-middle record-details">
        <Calendar
          @update-date="onDateChange"
          @edit-click="handleEditClick"
          @dissmised-popover="showPopover = false"
          :dates="mappedRecords"
          :show-edit-button="showEditButton"
          :is-popover-open="showPopover"
          :popover-item="popoverInfo"
        />
      </ion-card-content>
    </section>
    <WateringEditingModal
      v-if="selectedRecord"
      :is-open="showEditingModal"
      :plantId="plantId"
      :record="selectedRecord"
      @close="showEditingModal = false"
      @edited="handleEdited"
    />
    <WateringAddingModal
      :is-open="showAddingModal"
      :is-loading="isLoading"
      :date="selectedDate ?? undefined"
      @close="showAddingModal = false"
      @add-record="addRecord"
    />
  </ion-card>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonItem,
  IonLabel,
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonContent,
  IonIcon,
  IonPopover,
} from "@ionic/vue";
import { addCircle, create } from "ionicons/icons";

import Calendar from "@/components/calendar/Calendar.vue";
import WateringAddingModal from "./WateringAddingModal.vue";
import WateringEditingModal from "./WateringEditingModal.vue";

import WateringService from "@/services/WateringService";
import UserService from "@/services/UserService";

export default defineComponent({
  name: "WateringRecords",
  emits: ["add-record"],
  components: {
    IonItem,
    IonLabel,
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonContent,
    IonIcon,
    IonPopover,
    WateringAddingModal,
    WateringEditingModal,
    Calendar,
  },
  props: {
    plantId: {
      type: Number,
      required: true,
    },
    showAddButton: {
      type: Boolean,
      default: true,
    },
    showEditButton: {
      type: Boolean,
      default: true,
    },
  },
  setup() {
    return {
      addCircle,
      create,
    };
  },
  data() {
    return {
      records: null as WateringRecord[] | null,
      mappedRecords: [] as CalendarDates[],
      daysAgo: 0,
      selectedDate: null as string | null,
      selectedRecord: null as WateringRecord | null,
      showPopover: false,
      showAddingModal: false,
      showEditingModal: false,
      isGuest: false,
      isLoading: false,
    };
  },
  async mounted() {
    this.isGuest = await UserService.isGuest();
    await this.setRecords();
  },
  computed: {
    popoverInfo(): PopoverItem | undefined {
      if (!this.selectedRecord) return undefined;
      const title = "Wässerungsdetails";
      const fields = [
        {
          label: "Datum",
          value: new Date(this.selectedRecord.date_millis).toLocaleDateString(),
        },
        {
          label: "Dünger verwendet",
          value: this.selectedRecord.usedFertilizer ? "Ja" : "Nein",
        },
      ];
      if (
        this.selectedRecord.usedFertilizer &&
        this.selectedRecord.fertilizerType
      ) {
        fields.push({
          label: "Dünger Typ",
          value: this.selectedRecord.fertilizerType,
        });
      }
      const info = {
        title,
        fields,
      };
      return info;
    },
  },
  methods: {
    onDateChange(date: string) {
      const normalizedDate = date.split("T")[0];
      const found = this.records?.find((record) => {
        const recordDate = new Date(record.date_millis)
          .toISOString()
          .split("T")[0];
        return recordDate === normalizedDate;
      });

      if (found) {
        this.selectedRecord = found;
        this.showPopover = true;
      } else {
        this.selectedRecord = null;
        this.showPopover = false;
      }

      // If not found and same date selected again, show adding modal
      if (!found && this.selectedDate === date) {
        this.showAddingModal = true;
      }
      this.selectedDate = date;
    },
    async setRecords() {
      try {
        this.records = await WateringService.getWateringRecords(this.plantId);
        this.daysAgo = Math.floor(
          (new Date().getTime() -
            new Date(this.records[0].date_millis).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        this.mappedRecords = this.mapWateringsToCalendar(this.records);
      } catch (error) {}
    },
    handleEditClick(item: PopoverItem) {
      if (this.selectedRecord) {
        this.showPopover = false;
        this.showEditingModal = true;
      }
    },
    async handleEdited() {
      this.showEditingModal = false;
      await this.setRecords();
    },
    async addRecord(addingRecord: AddWateringRecord) {
      this.loadingTimeout();
      if (addingRecord.fertilizerTypeId === -1) {
        addingRecord.fertilizerTypeId = undefined;
        addingRecord.usedFertilizer = false;
      } else {
        addingRecord.usedFertilizer = true;
      }
      const plainRecord = JSON.parse(JSON.stringify(addingRecord));

      const response = await WateringService.addWateringRecord(
        this.plantId,
        plainRecord
      );
      if (response) {
        this.$nextTick(() => {
          this.showAddingModal = false;
        });
        await this.setRecords();
      }
    },
    loadingTimeout() {
      this.isLoading = true;
      const timeout_s = 10;
      setTimeout(() => {
        this.isLoading = false;
      }, timeout_s * 1000);
    },
    mapWateringsToCalendar(records: WateringRecord[]): CalendarDates[] {
      return records.map((record) => {
        const date = new Date(record.date_millis);
        return {
          date: date.toISOString().split("T")[0],
          title: `Wässerung am ${date.toLocaleDateString()}`,
          description: record.usedFertilizer
            ? `Dünger: ${record.fertilizerType}`
            : "Kein Dünger verwendet",
          category: "watering",
          textColor: "#000000",
          backgroundColor: "#b3e5fc",
        };
      });
    },
  },
});
</script>

<style scoped>
.watering-records {
  padding: 16px;
}

.record-header {
  font-weight: bold;
}

.record-details {
  padding: 0;
}

.record-title {
  font-weight: 500;
  font-size: 1.2rem;
  -webkit-padding-start: 20px;
  padding-inline-start: 20px;
  -webkit-padding-end: 20px;
  padding-inline-end: 20px;
}
</style>
