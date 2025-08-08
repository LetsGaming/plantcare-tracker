<template>
  <div>
    <ion-card>
      <ion-card-header>
        <ion-toolbar v-if="title || showSettingsButton">
          <ion-title v-if="title">{{ title }}</ion-title>
          <ion-button
            v-if="showSettingsButton"
            slot="end"
            @click="$emit('settings-click')"
          >
            <ion-icon :icon="settings" />
          </ion-button>
        </ion-toolbar>
      </ion-card-header>
      <ion-card-content style="padding: 0">
        <ion-datetime
          :value="selectedDate"
          @ionChange="onDateChange"
          presentation="date"
          :highlighted-dates="dates"
          :first-day-of-week="firstDayOfWeek"
        />
        <CalendarLegend
          v-if="dates.length > 0"
          :legend-items="legendItems"
        />
        <Popover
          :event="changedEvent"
          :is-open="isPopoverOpen"
          :show-edit-button="showEditButton"
          :title="popoverItem ? popoverItem.title : 'Details'"
          :fields="
            popoverItem?.fields
              ? popoverItem.fields
              : [
                  {
                    label: 'Date',
                    value: selectedDate,
                  },
                ]
          "
          @dismiss="$emit('dissmised-popover')"
          @edit-click="$emit('edit-click', popoverItem)"
        ></Popover>
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
import Popover from "@/components/Popover.vue";
import CalendarService from "@/services/CalendarService";
import CalendarLegend from "./CalendarLegend.vue";

import Utils from "@/utils/utils";

export default defineComponent({
  name: "Calendar",
  emits: ["settings-click", "update-date", "dissmised-popover", "edit-click"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonButton,
    IonIcon,
    IonTitle,
    IonToolbar,
    IonDatetime,
    Popover,
    CalendarLegend,
  },
  props: {
    title: {
      type: String,
      required: false,
    },
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    dates: {
      type: Array as () => CalendarDates[],
      default: () => [],
    },
    isPopoverOpen: {
      type: Boolean,
      default: false,
    },
    popoverItem: {
      type: Object as () => PopoverItem | undefined,
      required: false,
    },
  },
  data() {
    return {
      selectedDate: "",
      firstDayOfWeek: 1,
      changedEvent: null as CustomEvent | null,
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
  computed: {
    legendItems() {
      return Array.from(
        new Map(
          this.dates.map((date) => [
            date.category,
            {
              label: Utils.capitalizeFirstLetter(date.category),
              color: date.backgroundColor,
            },
          ])
        ).values()
      );
    },
  },
  methods: {
    onDateChange(event: CustomEvent) {
      this.changedEvent = event;
      const date = event.detail.value;
      this.selectedDate = date;
      this.$emit("update-date", date);
    },
  },
});
</script>
