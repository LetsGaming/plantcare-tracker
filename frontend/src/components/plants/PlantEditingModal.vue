<template>
  <IonModal :is-open="isOpen" @did-dismiss="$emit('close')">
    <ModalHeader headerTitle="Pflanze bearbeiten" @close="$emit('close')" />
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
            options: substrates.map((substrate) => ({
              value: substrate.id,
              label: substrate.name,
            })),
          },
          {
            type: 'radio',
            modelKey: 'isPublic',
            label: 'Sichtbarkeit',
            options: [
              { value: true, label: 'Öffentlich' },
              { value: false, label: 'Privat' },
            ],
            defaultValue: Boolean(plant.isPublic),
          },
        ]"
        cardTitle="Planzen Informationen"
        submitLabel="Pflanze editieren"
        :extraContentComponent="SubstrateContainer"
        :extraContentData="{ substrate: selectedSubstrate }"
        :isLoading="isLoading"
        @submitClick="editPlant"
        @delete-click="deletePlant"
      ></form-component>
    </IonContent>
  </IonModal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonModal, IonContent } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import FormComponent from "@/components/formcomponent/FormComponent.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";

import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "PlantEditingModal",
  emits: ["close", "edited"],
  components: {
    IonModal,
    IonContent,

    ModalHeader,
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
      substrates: [] as Substrate[],
      isLoading: false,
    };
  },
  setup() {
    return { SubstrateContainer };
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
        const response = await SubstrateService.getAllSubstrates();

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
        this.isLoading = true;
        const response = await PlantService.editPlant(
          this.plant.id,
          this.editPlantData
        );
        if (response) {
          this.isLoading = false;
          this.$emit("edited");
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while adding the plant");
      }
    },
    async deletePlant() {
      try {
        this.isLoading = true;
        const response = await PlantService.deletePlant(this.plant.id);
        if (response) {
          this.isLoading = false;
          this.$emit("close");
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
