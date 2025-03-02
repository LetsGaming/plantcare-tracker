<template>
  <ion-card>
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Watering Records</ion-title>
        <template v-if="!isGuest">
          <ion-icon
            :icon="addCircle"
            slot="end"
            @click="showAddingModal = true"
          />
        </template>
      </ion-toolbar>
    </ion-card-header>
    <section class="watering-records">
      <ion-card-content>
        <CustomAccordion :items="mappedRecords" />
      </ion-card-content>
    </section>
    <WateringRecordsAdding
      :is-open="showAddingModal"
      @close="showAddingModal = false"
      @add-record="addRecord"
    ></WateringRecordsAdding>
  </ion-card>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonAccordion,
  IonAccordionGroup,
  IonItem,
  IonLabel,
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonIcon,
} from "@ionic/vue";
import { addCircle } from "ionicons/icons";

import WateringRecordsAdding from "./WateringRecordsAdding.vue";
import CustomAccordion from "@/components/CustomAccordion.vue";

import WateringService from "@/services/WateringService";
import AuthUtils from "@/utils/authUtils";

export default defineComponent({
  name: "WateringRecords",
  emits: ["add-record"],
  components: {
    IonAccordion,
    IonAccordionGroup,
    IonItem,
    IonLabel,
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonIcon,
    WateringRecordsAdding,
    CustomAccordion,
  },
  props: {
    plantId: {
      type: Number,
      required: true,
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
      showAddingModal: false,
      isGuest: false,
    };
  },
  async mounted() {
    this.isGuest = await AuthUtils.isGuest();
    await this.setRecords();
  },
  methods: {
    async setRecords() {
      try {
        this.records = await WateringService.getWateringRecords(this.plantId);
        this.records = this.records.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        this.mappedRecords = this.mapWateringsToAccordion(this.records);
      } catch (error) {}
    },
    async addRecord(addingRecord: AddWateringRecord) {
      const response = await WateringService.addWateringRecord(
        this.plantId,
        addingRecord
      );
      if (response) {
        this.records = await WateringService.getWateringRecords(this.plantId);
        this.showAddingModal = false;
      }
    },
    mapWateringsToAccordion(records: WateringRecord[]) {
      return records.map((record) => ({
        id: record.id,
        name: record.date,
        details: {
          "Dünger genutzt": record.usedFertilizer ? "Ja" : "Nein",
          ...(record.usedFertilizer && {
            "Dünger Typ": record.fertilizerType ?? "",
          }),
        },
      }));
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
</style>
