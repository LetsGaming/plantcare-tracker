<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <IonTitle>Neue Pflanze hinzufügen</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <form-component
        :item="plant"
        :formFields="[
          { type: 'input', modelKey: 'name', label: 'Name', required: true },
          {
            type: 'input',
            modelKey: 'species',
            label: 'Spezies',
            required: true,
          },
          {
            type: 'select',
            modelKey: 'substrateId',
            label: 'Substrat',
            placeholder: 'Substrat auswählen',
            options: substrates,
          },
          {
            type: 'radio',
            modelKey: 'isPublic',
            label: 'Sichtbarkeit',
            options: [
              { value: true, label: 'Öffentlich' },
              { value: false, label: 'Privat' },
            ],
          },
        ]"
        cardTitle="Planzen Informationen"
        submitLabel="Pflanze hinzufügen"
        :extraContentComponent="SubstrateContainer"
        :extraContentData="{ substrate: selectedSubstrate }"
        @submitClick="addPlant"
      ></form-component>
    </IonContent>
  </IonPage>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonRadioGroup,
  IonRadio,
} from "@ionic/vue";
import FormComponent from "@/components/adding/FormComponent.vue";
import SubstrateContainer from "@/components/plants/SubstrateContainer.vue";

import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  components: {
    IonPage,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonButton,
    IonRadioGroup,
    IonRadio,

    FormComponent,
    SubstrateContainer,
  },
  data() {
    return {
      plant: {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false, // Default to private
      } as AddPlant,
      substrates: [] as Substrate[], // Substrate data will be fetched from API
    };
  },
  setup() {
    return { SubstrateContainer };
  },
  async mounted() {
    await this.fetchSubstrates(); // Fetch substrates when component mounts
  },
  computed: {
    selectedSubstrate() {
      return this.substrates.find(
        (substrate) => substrate.id === this.plant.substrateId
      );
    },
  },
  methods: {
    async fetchSubstrates() {
      try {
        const response = await SubstrateService.getSubstrates();

        this.substrates = response;
      } catch (error) {
        console.error("Error fetching substrates:", error);
      }
    },
    async addPlant() {
      if (!this.plant.name || !this.plant.species || !this.plant.substrateId) {
        ToastService.showWarning("All fields are required!");
        return;
      }

      try {
        const response = await PlantService.addPlant(this.plant);
        if (response) {
          this.$router.push("/plants"); // Redirect to plant list after success
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while adding the plant");
      }
    },
  },
});
</script>
