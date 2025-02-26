<template>
  <ion-modal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ion-header>
      <ion-toolbar>
        <ion-title>Wasserung hinzufügen</ion-title>
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
        :formFields="[
          {
            label: 'Datum',
            type: 'date',
            modelKey: 'date',
          },
          {
            label: 'Dünger verwendet',
            type: 'switch',
            modelKey: 'usedFertilizer',
          },
          {
            type: 'radio',
            modelKey: 'fertilizerType',
            label: 'Düngertyp',
            options: [
              { value: 'organic', label: 'Organisch' },
              { value: 'synthetic', label: 'Mineralisch' },
            ],
          }
        ]"
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
import FormComponent from "@/components/FormComponent.vue";

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
    isOpen: {
      type: Boolean,
      required: true,
    },
  },
  setup() {
    return {
      close,
    };
  },
  data() {
    return {
      record: {
        date: new Date(),
        usedFertilizer: false,
        fertilizerType: null,
      } as AddWateringRecord,
    };
  },
  methods: {
  },
});
</script>
