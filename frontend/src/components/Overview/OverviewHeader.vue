<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-title>{{ title }}</ion-title>
    </ion-toolbar>

    <ion-toolbar class="segment-toolbar">
      <ion-segment v-model="segmentValue" @ionChange="handleSegmentChange">
        <ion-segment-button
          v-for="segment in segments"
          :key="segment.value"
          :value="segment.value"
        >
          <ion-icon :icon="segment.icon" />
          <ion-label>{{ segment.label }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      <ion-icon
        v-if="showAddButton"
        :name="addIcon"
        style="width: 32px; height: 32px"
        slot="end"
        @click="onAddClick"
      />
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

export default defineComponent({
  name: "CustomHeader",
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
        Array<{ value: string; label: string; icon: string }>
      >,
      required: true,
    },
    showAddButton: {
      type: Boolean,
      default: true,
    },
    addIcon: {
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
      };
  },
  methods: {
    handleSegmentChange(event: any) {
      const value = event.detail.value;
      this.onSegmentChange(value);
    },
    handleAddClick() {
      if (this.onAddClick) {
        this.onAddClick();
      }
    },
  },
});
</script>

<style scoped>
.header-toolbar {
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
