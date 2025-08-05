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
  name: "MenuCalendar",
  emits: ["settings-click", "update:selectedDate"],
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
    selectedDate: {
      type: String,
      required: false,
    },
  },
  data() {
    return {
      dates: [],
      firstDayOfWeek: 1,
    };
  },
  setup(props, { emit }) {
    const onDateChange = (event: CustomEvent) => {
      emit("update:selectedDate", event.detail.value);
    };

    return {
      settings,
      onDateChange,
      selectedDate: props.selectedDate,
    };
  },
  async mounted() {
    this.firstDayOfWeek = await CalendarService.getFirstDayOfWeek();
  },
});
</script>
