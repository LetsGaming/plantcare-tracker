<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <IonHeader>
      <IonToolbar>
        <IonTitle>Pflanze editieren</IonTitle>
        <ion-buttons slot="end">
          <ion-button @click="$emit('close')">
            <IonIcon :icon="close" />
          </ion-button>
        </ion-buttons>
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
        @delete-click="deletePlant"
      ></form-component>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
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
  IonIcon,
} from "@ionic/vue";
import FormComponent from "@/components/adding/FormComponent.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";

import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";

import { close, trashBin } from "ionicons/icons";

export default defineComponent({
  name: "PlantEditing",
  emits: ["close"],
  components: {
    IonModal,
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
    IonIcon,

    FormComponent,
    SubstrateContainer,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    plant: {
      type: Object as PropType<Plant>,
      required: true,
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
      showDeleteModal: false,
    };
  },
  setup() {
    return { SubstrateContainer, close, trashBin };
  },
  async mounted() {
    this.editPlantData = {
      name: this.plant.name,
      species: this.plant.species,
      substrateId: this.plant.substrate.id,
      isPublic: this.plant.isPublic,
    };
    await this.fetchSubstrates(); // Fetch substrates when component mounts
  },
  computed: {
    selectedSubstrate() {
      return this.substrates.find(
        (substrate) => substrate.id === this.editPlantData.substrateId
      );
    },
  },
  methods: {
    async fetchSubstrates() {
      try {
        const response = await SubstrateService.getSubstrates(
          this.plant.isPublic || false
        );

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
        this.plant.isPublic == this.editPlantData.isPublic
      ) {
        ToastService.showWarning("At least one field is required!");
        return;
      }

      try {
        const response = await PlantService.editPlant(
          this.plant.id,
          this.editPlantData
        );
        if (response) {
          this.$emit("close");
          this.$router.push({ name: "plant-overview" }); // Redirect to plant list after success
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while adding the plant");
      }
    },
    async deletePlant() {
      try {
        const response = await PlantService.deletePlant(this.plant.id);
        if (response) {
          this.showDeleteModal = false;
          await this.$router.push({ name: "plant-overview" }); // Redirect to plant list after success
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while deleting the plant");
      }
    },
  },
});
</script>
