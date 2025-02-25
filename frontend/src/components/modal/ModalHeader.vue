<template>
  <IonHeader>
    <IonToolbar>
      <IonTitle>{{ headerTitle }}</IonTitle>
      <ion-buttons slot="end">
        <ion-button @click="$emit('close')">
          <IonIcon :icon="close" />
        </ion-button>
      </ion-buttons>
    </IonToolbar>
  </IonHeader>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonHeader,
  IonButtons,
  IonButton,
  IonToolbar,
  IonTitle,
  IonIcon,
} from "@ionic/vue";
import { close } from "ionicons/icons";
export default defineComponent({
  name: "ModalHeader",
  emits: ["close"],
  components: {
    IonHeader,
    IonButtons,
    IonButton,
    IonToolbar,
    IonTitle,
    IonIcon,
  },
  props: {
    headerTitle: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { close };
  },
});
</script>
