<template>
  <ion-header>
    <ion-toolbar class="header-toolbar">
      <ion-buttons slot="start">
        <ion-back-button
          v-if="defaultBackHref"
          text="Zurück"
          :defaultHref="defaultBackHref"
        ></ion-back-button>
        <ion-back-button v-else text="Zurück"></ion-back-button>
      </ion-buttons>
      <ion-icon
        v-if="showUploadButton"
        :icon="cloudUpload"
        style="width: 32px; height: 32px"
        slot="end"
        @click="onUploadClick"
      />
      <ion-icon
        v-if="showEditButton"
        :icon="create"
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
  IonButtons,
  IonBackButton,
  IonLabel,
  IonIcon,
} from "@ionic/vue";
import { create, cloudUpload } from "ionicons/icons";

export default defineComponent({
  name: "DetailsHeader",
  components: {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonLabel,
    IonIcon,
  },
  props: {
    defaultBackHref: {
      type: String,
      required: false,
    },
    showEditButton: {
      type: Boolean,
      default: true,
    },
    showUploadButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
    onUploadClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    return { create, cloudUpload };
  },
  data() {
    return {
      segmentValue: this.startingSegment,
    };
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
