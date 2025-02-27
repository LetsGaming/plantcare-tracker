<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-title>{{ title }}</ion-title>
      <ion-icon
        :icon="logOutOutline"
        slot="end"
        @click="logUserOut"
        style="padding-right: 20px"
      ></ion-icon>
    </ion-toolbar>

    <ion-toolbar class="segment-toolbar">
      <ion-segment v-model="segmentValue" @ionChange="handleSegmentChange">
        <template v-for="segment in segments">
          <ion-segment-button
            v-if="!segment.hideFromGuests || !isGuest"
            :key="segment.value"
            :value="segment.value"
          >
            <ion-icon :icon="segment.icon" />
            <ion-label>{{ segment.label }}</ion-label>
          </ion-segment-button>
        </template>
      </ion-segment>

      <template v-if="!isGuest && showAddButton">
        <ion-icon
          v-if="onAddClick && addIcon"
          :icon="addIcon"
          slot="end"
          @click="onAddClick"
          class="add-icon"
        />

        <ion-icon
          v-else-if="onAddClick"
          :name="addIconName"
          slot="end"
          @click="onAddClick"
          class="add-icon"
        />
      </template>
    </ion-toolbar>
  </ion-header>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonIcon,
} from "@ionic/vue";
import { logOutOutline } from "ionicons/icons";
import AuthUtils from "@/utils/authUtils";

export default defineComponent({
  name: "OverviewHeader",
  components: {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonIcon,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    segments: {
      type: Array as PropType<
        Array<{
          value: string;
          label: string;
          icon: string;
          hideFromGuests?: boolean;
        }>
      >,
      required: true,
    },
    showAddButton: {
      type: Boolean,
      default: true,
    },
    addIcon: {
      type: String,
      required: false,
    },
    addIconName: {
      type: String,
      default: "addCircle",
    },
    startingSegment: {
      type: String,
      required: true,
    },
    onSegmentChange: {
      type: Function as PropType<(value: string) => void>,
      required: true,
    },
    onAddClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  data() {
    return {
      segmentValue: this.startingSegment,
      isGuest: false,
    };
  },
  setup() {
    return { logOutOutline };
  },
  async mounted() {
    this.isGuest = await AuthUtils.isGuest();

    if (this.isGuest) {
      // If the user is a guest, and the starting segment is hidden, find the first visible segment
      const visibleSegments = this.segments.filter(
        (segment) => !segment.hideFromGuests
      );
      if (visibleSegments.length > 0) {
        this.segmentValue = visibleSegments[0].value; // Select the first visible segment for guests
        // Manually trigger the segment change to emit the value change
        this.handleSegmentChange({
          detail: { value: this.segmentValue },
        });
      }
    }
  },
  methods: {
    async logUserOut() {
      await AuthUtils.logout();
    },
    handleSegmentChange(event: any) {
      const value = event.detail.value;
      this.onSegmentChange(value); // Emit the segment change
    },
  },
});
</script>

<style scoped>
.header-toolbar {
  text-align: center;
  background-color: var(--ion-color-primary);
  color: white;
}

.segment-toolbar {
  background-color: var(--ion-color-light);
  position: sticky;
  top: 0;
  z-index: 1000;
}
</style>
