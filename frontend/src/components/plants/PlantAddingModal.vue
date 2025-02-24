<template>
    <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
      <IonHeader>
        <IonToolbar>
          <IonTitle>Neue Pflanze hinzufügen</IonTitle>
          <ion-buttons slot="end">
            <ion-button @click="$emit('close')">
              <IonIcon :icon="close" />
            </ion-button>
          </ion-buttons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <form-component
          :item="plant"
          :formFields="[
            { type: 'input', modelKey: 'name', label: 'Name', required: true },
            { type: 'input', modelKey: 'species', label: 'Spezies', required: true },
            {
              type: 'select',
              modelKey: 'substrateId',
              label: 'Substrat',
              placeholder: 'Substrat auswählen',
              options: substrates
            },
            {
              type: 'radio',
              modelKey: 'isPublic',
              label: 'Sichtbarkeit',
              options: [
                { value: true, label: 'Öffentlich' },
                { value: false, label: 'Privat' }
              ]
            },
            {
              type: 'file',
              modelKey: 'uploadImage',
              label: 'Bild hochladen'
            }
          ]"
          cardTitle="Pflanzen Informationen"
          submitLabel="Pflanze hinzufügen"
          :extraContentComponent="SubstrateContainer"
          :extraContentData="{ substrate: selectedSubstrate }"
          @submitClick="addPlant"
        />
      </IonContent>
    </IonModal>
  </template>
  
  <script lang="ts">
  import { defineComponent } from "vue";
  import {
    IonModal,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonTitle,
    IonContent,
    IonIcon,
  } from "@ionic/vue";
  import FormComponent from "@/components/adding/FormComponent.vue";
  import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
  
  import PlantService from "@/services/PlantService";
  import SubstrateService from "@/services/SubstrateService";
  import ToastService from "@/services/general/ToastService";
  
  import { close } from "ionicons/icons";
  
  export default defineComponent({
    name: "PlantAddingModal",
    emits: ["close"],
    components: {
      IonModal,
      IonHeader,
      IonToolbar,
      IonButtons,
      IonButton,
      IonTitle,
      IonContent,
      IonIcon,
      FormComponent,
      SubstrateContainer,
    },
    props: {
      isOpen: {
        type: Boolean,
        required: true,
      },
    },
    data() {
      return {
        plant: {
          name: "",
          species: "",
          substrateId: 0,
          isPublic: false, // Default to private
          uploadImage: null as File | null,
        } as AddPlant,
        substrates: [] as Substrate[], // Will be fetched from API
      };
    },
    computed: {
      selectedSubstrate() {
        return this.substrates.find(
          (substrate) => substrate.id === this.plant.substrateId
        );
      },
    },
    async mounted() {
      await this.fetchSubstrates();
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
      async addPlant() {
        if (!this.plant.name || !this.plant.species || !this.plant.substrateId) {
          ToastService.showWarning("All fields are required!");
          return;
        }
        try {
          const response = await PlantService.addPlant(this.plant);
          if (response) {
            const plantId = response.plantId;
            if (!this.plant.image) {
              this.$emit("close");
              this.$router.push({ name: "plant-overview" });
            } else {
              await this.imageUpload(plantId, this.plant.image);
            }
          }
        } catch (error) {
          console.error("Error adding plant:", error);
          ToastService.showError("Error while adding the plant");
        }
      },
      async imageUpload(id: number, file: File) {
        try {
          await PlantService.uploadPlantImage(id, file);
          this.$emit("close");
          this.$router.push({ name: "plant-overview" });
        } catch (error) {
          console.error("Error uploading image:", error);
          ToastService.showError("Error while uploading the image");
        }
      },
    },
    setup() {
      return { SubstrateContainer, close };
    },
  });
  </script>
  