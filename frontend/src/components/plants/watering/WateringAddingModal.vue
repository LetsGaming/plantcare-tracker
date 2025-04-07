<template>
  <ion-modal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Wässerung hinzufügen</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">
            <ion-icon :icon="close" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <form-component
        card-title="Wässerung hinzufügen"
        :item="record"
        :formFields="formFields"
        submit-label="Hinzufügen"
        :is-loading="isLoading"
        @submit-click="$emit('add-record', record)"
      ></form-component>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
} from "@ionic/vue";
import { close } from "ionicons/icons";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import WateringService from "@/services/WateringService";

export default defineComponent({
  name: "WateringRecordsAdding",
  emits: ["close", "add-record"],
  components: {
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    FormComponent,
  },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, required: true },
  },
  data() {
    return {
      close,
      fertilizerOptions: [] as { label: string; value: string }[],
      record: {
        date: undefined,
        usedFertilizer: false,
        fertilizerTypeId: null,
      } as AddWateringRecord,
    };
  },
  watch: {
    "record.fertilizerTypeId"(newVal) {
      this.record.usedFertilizer = newVal && newVal !== "none";
      if (newVal === "none") {
        this.record.fertilizerTypeId = null;
        this.record.usedFertilizer = false;
      }
    },
  },
  async mounted() {
    const types = await WateringService.getFertilizerTypes();
    this.fertilizerOptions = types.map((t) => ({
      label: t.name,
      value: t.id,
    }));
  },
  computed: {
    formFields() {
      return [
        { label: "Datum", type: "date", modelKey: "date" },
        {
          type: "radio",
          modelKey: "fertilizerTypeId",
          label: "Düngertyp",
          options: [
            ...this.fertilizerOptions,
            { label: "Kein Dünger", value: "none" },
          ],
          defaultValue: "none",
        },
      ];
    },
  },
});
</script>
