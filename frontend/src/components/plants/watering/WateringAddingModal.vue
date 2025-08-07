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
    date: { type: String, required: false, default: undefined },
  },
  data() {
    return {
      close,
      fertilizerOptions: [] as { label: string; value: number }[],
      record: {
        date: undefined,
        usedFertilizer: false,
        fertilizerTypeId: undefined,
      } as AddWateringRecord,
    };
  },
  watch: {
    "record.fertilizerTypeId"(newVal) {
      this.record.usedFertilizer = newVal && newVal !== "none";
      if (newVal === "none") {
        this.record.fertilizerTypeId = undefined;
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
    formFields(): FormField[] {
      return [
        {
          label: "Datum",
          type: "date" as const,
          modelKey: "date",
          defaultValue: this.date,
        },
        {
          type: "radio" as const,
          modelKey: "fertilizerTypeId",
          label: "Düngertyp",
          options: [
            ...this.fertilizerOptions,
            { label: "Kein Dünger", value: -1 },
          ],
          defaultValue: -1,
        },
      ];
    },
  },
});
</script>
