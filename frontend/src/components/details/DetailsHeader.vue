<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-buttons slot="start">
        <ion-back-button text="Zurück"></ion-back-button>
      </ion-buttons>
      <ion-icon
        v-if="showEditButton"
        :icon="editIcon"
        style="width: 32px; height: 32px"
        slot="end"
        @click="onEditClick"
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
  name: "DetailsHeader",
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
    showEditButton: {
      type: Boolean,
      default: true,
    },
    editIcon: {
      type: String,
      default: "create",
    },
    onEditClick: {
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
    handleEditClick() {
      if (this.onEditClick) {
        this.onEditClick();
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
