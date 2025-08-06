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
      <ion-card-content>
        <Calendar @update-date="onDateChange" />
        <ion-popover
          :is-open="showPopover"
          :event="popoverEvent"
          @didDismiss="showPopover = false"
        >
          <ion-content class="ion-padding">
            <div v-if="selectedRecord">
              <ion-title class="record-header">
                Wässerung am {{ selectedRecord.date }}
                <ion-icon
                  slot="end"
                  name="close"
                  @click="showEditingModal = true; showPopover = false"
              />
              </ion-title>
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
  IonIcon,
  IonPopover,
} from "@ionic/vue";
import { addCircle } from "ionicons/icons";

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
    };
  },
  data() {
    return {
      records: null as WateringRecord[] | null,
      mappedRecords: [] as AccordionItem[],
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
    onDateChange({ date, event }: { date: string; event: any }) {
      this.selectedDate = date;

      const found = this.records?.find((record) => {
        const recordDate = new Date(record.date_millis)
          .toISOString()
          .split("T")[0];
        return recordDate === date;
      });

      if (found) {
        this.selectedRecord = found;
        this.popoverEvent = event;
        this.showPopover = true;
      } else {
        this.selectedRecord = null;
        this.showPopover = false;
      }
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
        this.mappedRecords = this.mapWateringsToAccordion(this.records);
      } catch (error) {}
    },
    async handleEditClick(item: AccordionItem) {
      const record = this.records?.find((r) => r.id === item.id);
      if (!record) return;
      this.editRecord = record ?? null;
      this.showEditingModal = true;
    },
    async handleEdited() {
      this.showEditingModal = false;
      await this.setRecords();
    },
    async addRecord(addingRecord: AddWateringRecord) {
      this.isLoading = true;
      const response = await WateringService.addWateringRecord(
        this.plantId,
        addingRecord
      );
      if (response) {
        this.isLoading = false;
        this.$nextTick(() => {
          this.showAddingModal = false;
        });
        await this.setRecords();
      }
    },
    mapWateringsToAccordion(records: WateringRecord[]) {
      return records.map((record) => {
        return {
          id: record.id,
          name: record.date,
          details: {
            "Dünger genutzt": record.usedFertilizer ? "Ja" : "Nein",
            ...(record.usedFertilizer && {
              "Dünger Typ": record.fertilizerType ?? "",
            }),
          },
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
