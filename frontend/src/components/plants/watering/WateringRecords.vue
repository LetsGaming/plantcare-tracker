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
      <ion-card-content class="align-middle">
        <Calendar @update-date="onDateChange" :dates="mappedRecords" />
        <ion-popover
          :is-open="showPopover"
          :event="popoverEvent"
          @didDismiss="showPopover = false"
        >
          <ion-content class="ion-padding">
            <div v-if="selectedRecord">
              <ion-toolbar>
                <ion-title class="record-header">Wässerung</ion-title>
                <ion-icon
                  slot="end"
                  :icon="create"
                  @click="handleEditClick(selectedRecord.id)"
                />
              </ion-toolbar>
              <p><strong>Datum:</strong> {{ selectedRecord.date }}</p>
              <p>
                <strong>Dünger genutzt:</strong>
                {{ selectedRecord.usedFertilizer ? "Ja" : "Nein" }}
              </p>
              <p v-if="selectedRecord.usedFertilizer">
                <strong>Dünger Typ:</strong> {{ selectedRecord.fertilizerType }}
              </p>
            </div>
          </ion-content>
        </ion-popover>
      </ion-card-content>
    </section>
    <WateringEditingModal
      v-if="editRecord"
      :is-open="showEditingModal"
      :plantId="plantId"
      :record="editRecord"
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
      editRecord: null as WateringRecord | null,
      daysAgo: 0,
      selectedDate: null as string | null,
      selectedRecord: null as WateringRecord | null,
      popoverEvent: null as Event | null,
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
  methods: {
    onDateChange({ date, event }: { date: string; event: Event }) {
      const normalizedDate = new Date(date).toISOString().split("T")[0];
      const found = this.records?.find((record) => {
        const recordDate = new Date(record.date_millis)
          .toISOString()
          .split("T")[0];
        return recordDate === normalizedDate;
      });

      if (found) {
        this.selectedRecord = found;
        this.popoverEvent = event;
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
        this.records = this.records.sort(
          (a, b) =>
            new Date(b.date_millis).getTime() -
            new Date(a.date_millis).getTime()
        );
        this.daysAgo = Math.floor(
          (new Date().getTime() -
            new Date(this.records[0].date_millis).getTime()) /
            (1000 * 60 * 60 * 24)
        );
        this.mappedRecords = this.mapWateringsToCalendar(this.records);
      } catch (error) {}
    },
    async handleEditClick(id: number) {
      const record = this.records?.find((r) => r.id === id);
      if (!record) return;
      this.editRecord = record ?? null;
      this.showPopover = false;
      this.showEditingModal = true;
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
  padding: 16px;
  border-radius: 8px;
  margin-top: 8px;
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
