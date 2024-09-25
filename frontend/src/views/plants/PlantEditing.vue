<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
        <IonTitle>Pflanze editieren</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent>
      <form-component
        :item="editPlantData"
        :formFields="[
          { type: 'input', modelKey: 'name', label: 'Name', required: false },
          {
            type: 'input',
            modelKey: 'species',
            label: 'Spezies',
            required: false,
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
        submitLabel="Pflanze editieren"
        :extraContentComponent="SubstrateContainer"
        :extraContentData="{ substrate: selectedSubstrate }"
        @submitClick="editPlant"
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
  props: {
    id: {
      type: String,
      required: true,
    },
    isPublic: {
      type: String,
      required: false,
    },
  },
  data() {
    return {
      editPlantData: {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
      } as EditPlant,
      substrates: [] as Substrate[], // Substrate data will be fetched from API
    };
  },
  setup() {
    return { SubstrateContainer };
  },
  async mounted() {
    await this.fetchSubstrates(); // Fetch substrates when component mounts
    this.editPlantData.isPublic = this.isPlantPublic;
  },
  computed: {
    selectedSubstrate() {
      return this.substrates.find(
        (substrate) => substrate.id === this.editPlantData.substrateId
      );
    },
    plantId() {
      return Number.parseInt(this.id);
    },
    isPlantPublic() {
      return this.isPublic === "1";
    }
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
    async editPlant() {
      if (
        !this.editPlantData.name &&
        !this.editPlantData.species &&
        !this.editPlantData.substrateId &&
        this.isPlantPublic == this.editPlantData.isPublic
      ) {
        ToastService.showWarning("At least one field is required!");
        return;
      }

      try {
        const response = await PlantService.editPlant(
          this.plantId,
          this.editPlantData
        );
        if (response) {
          this.$router.push({ name: "plant-overview" }); // Redirect to plant list after success
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while adding the plant");
      }
    },
  },
});
</script>
