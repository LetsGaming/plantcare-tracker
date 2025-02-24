<template>
  <ion-card>
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Watering Records</ion-title>
        <ion-icon
          :icon="addCircle"
          slot="end"
          @click="showAddingModal = true"
        />
      </ion-toolbar>
    </ion-card-header>
    <section class="watering-records">
      <ion-card-content>
        <ion-accordion-group>
          <ion-accordion v-for="record in sortedRecords" :key="record.id">
            <ion-item slot="header" class="record-header">
              <ion-label>
                {{ record.date }}
              </ion-label>
            </ion-item>
            <div slot="content" class="record-details">
              <p>
                <strong>Fertilizer Used:</strong>
                {{ record.usedFertilizer ? "Yes" : "No" }}
              </p>
              <p v-if="record.usedFertilizer && record.fertilizerType">
                <strong>Fertilizer Type:</strong> {{ record.fertilizerType }}
              </p>
            </div>
          </ion-accordion>
        </ion-accordion-group>
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

import Utils from "@/utils/utils";
import WateringService from "@/services/WateringService";

import WateringRecordsAdding from "./WateringRecordsAdding.vue";


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
      showAddingModal: false,
    };
  },
  async mounted() {
    this.records = await WateringService.getWateringRecords(this.plantId);
  },
  methods: {
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
  },
  computed: {
    sortedRecords() {
      return this.records?.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
    },
  },
});
</script>

<style scoped>
.watering-records {
  padding: 16px;
}

.record-header {
  background: var(--ion-color-light-tint);
  border-radius: 8px;
  font-weight: bold;
}

.record-details {
  padding: 16px;
  background: var(--ion-color-light);
  border-radius: 8px;
  margin-top: 8px;
}
</style>
