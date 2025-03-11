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
      <ion-card-content>
        <ion-item v-for="record in mappedRecords">
          <Accordion :item="record" @edit-click="handleEditClick" :show-edit-button="showEditButton && !isGuest"/>
        </ion-item>
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
      @close="showAddingModal = false"
      @add-record="addRecord"
    />
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

import WateringAddingModal from "./WateringAddingModal.vue";
import WateringEditingModal from "./WateringEditingModal.vue";
import Accordion from "@/components/accordion/Accordion.vue";

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
    WateringAddingModal,
    WateringEditingModal,
    Accordion,
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
      showAddingModal: false,
      showEditingModal: false,
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
      const response = await WateringService.addWateringRecord(
        this.plantId,
        addingRecord
      );
      if (response) {
        this.showAddingModal = false;
        await this.setRecords();
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
