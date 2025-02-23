<template>
  <ion-card>
    <ion-toolbar>
      <ion-title>Watering Records</ion-title>
    </ion-toolbar>
    <section class="watering-records">
      <ion-accordion-group>
        <ion-accordion v-for="record in sortedRecords" :key="record.id">
          <ion-item slot="header" class="record-header">
            <ion-label>
              {{ formatDate(record.date) }} - Plant ID: {{ record.plantId }}
            </ion-label>
          </ion-item>
          <div slot="content" class="record-details">
            <p><strong>Amount:</strong> {{ record.amount }} ml</p>
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
    </section>
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
} from "@ionic/vue";

export default defineComponent({
  components: {
    IonAccordion,
    IonAccordionGroup,
    IonItem,
    IonLabel,
    IonToolbar,
    IonTitle,
    IonCard,
  },
  props: {
    records: {
      type: Array as () => WateringRecord[],
      required: true,
    },
  },
  methods: {
    formatDate(dateString: string) {
      const options: Intl.DateTimeFormatOptions = {
        year: "numeric",
        month: "long",
        day: "numeric",
      };
      return new Date(dateString).toLocaleDateString(undefined, options);
    },
  },
  computed: {
    sortedRecords() {
      return this.records.sort(
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
