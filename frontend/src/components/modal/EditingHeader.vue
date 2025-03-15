<template>
  <ion-header>
    <ion-toolbar>
      <IonTitle>{{ headerTitle }}</IonTitle>
      <ion-buttons slot="start">
        <ion-button @click="closeModal()">Zurück</ion-button>
      </ion-buttons>
      <ion-icon
        v-if="showEditButton && onEditClick"
        :icon="create"
        style="width: 32px; height: 32px"
        slot="end"
        @click="onEditClick"
      />
    </ion-toolbar>
  </ion-header>
</template>

<script lang="ts">
import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonIcon,
  IonTitle,
} from "@ionic/vue";
import { defineComponent, PropType } from "vue";
import { create } from "ionicons/icons";

export default defineComponent({
  name: "EditModalHeader",
  emits: ["close"],
  components: {
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
  },
  props: {
    headerTitle: {
      type: String,
      required: true,
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    return {
      create,
    };
  },
  methods: {
    closeModal() {
      this.$emit("close");
    },
  },
});
</script>
