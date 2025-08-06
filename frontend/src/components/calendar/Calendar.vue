<template>
  <div>
    <ion-card>
      <ion-card-header>
        <ion-toolbar>
          <ion-title>{{ title }}</ion-title>
          <ion-button
            v-if="showSettingsButton"
            slot="end"
            @click="$emit('settings-click')"
          >
            <ion-icon :icon="settings" />
          </ion-button>
        </ion-toolbar>
      </ion-card-header>
      <ion-card-content>
        <ion-datetime
          :value="selectedDate"
          @ionChange="onDateChange"
          presentation="date"
          :highlighted-dates="dates"
          :first-day-of-week="firstDayOfWeek"
        />
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonButton,
  IonIcon,
  IonTitle,
  IonToolbar,
  IonDatetime,
} from "@ionic/vue";
import { settings } from "ionicons/icons";

import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "Calendar",
  emits: ["settings-click", "update-date"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonButton,
    IonIcon,
    IonTitle,
    IonToolbar,
    IonDatetime,
  },
  props: {
    title: {
      type: String,
      default: "Erinnerungen",
    },
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      dates: [] as CalendarDates[],
      selectedDate: "",
      firstDayOfWeek: 1,
    };
  },
  setup() {
    return {
      settings,
    };
  },
  async mounted() {
    this.firstDayOfWeek = await CalendarService.getFirstDayOfWeek();
  },
  methods: {
    onDateChange(event: CustomEvent) {
      const date = event.detail.value;
      this.selectedDate = date;
      this.$emit("update-date", date);
    },
  },
});
</script>
