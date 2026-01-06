<template>
  <BaseFormModal
    :isOpen="isOpen"
    :isLoading="isLoading"
    modalTitle="Pflanze bearbeiten"
    formTitle="Pflanzen Informationen"
    submitLabel="Pflanze editieren"
    :formData="editPlantData"
    :formFields="formFields"
    :extraContentComponent="SubstrateContainer"
    :extraContentData="{ substrate: selectedSubstrate }"
    :deleteHandler="deletePlant"
    @close="$emit('close')"
    @submit="editPlant"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";

import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "PlantEditingModal",
  emits: ["close", "edited"],
  components: {
    BaseFormModal,
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
    return {
      SubstrateContainer,
    };
  },
  async mounted() {
    this.editPlantData = {
      name: this.plant.name,
      species: this.plant.species,
      substrateId: this.plant.substrate.id,
      isPublic: this.plant.isPublic,
    };
  },
  watch: {
    isOpen(newVal: boolean) {
      if (newVal && this.substrates.length === 0) {
        this.fetchSubstrates();
      }
    },
  },
  computed: {
    formFields(): FormField[] {
      return [
        { type: "input", modelKey: "name", label: "Name", required: false },
        {
          type: "input",
          modelKey: "species",
          label: "Spezies",
          required: false,
        },
        {
          type: "select",
          modelKey: "substrateId",
          label: "Substrat",
          placeholder: "Substrat auswählen",
          options: this.substrates.map((substrate) => ({
            value: substrate.id,
            label: substrate.name,
          })),
        },
        {
          type: "radio",
          modelKey: "isPublic",
          label: "Sichtbarkeit",
          options: [
            { value: true, label: "Öffentlich" },
            { value: false, label: "Privat" },
          ],
          defaultValue: Boolean(this.plant.isPublic),
        },
      ];
    },
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
        this.loadingTimeout();
        const response = await PlantService.editPlant(
          this.plant.id,
          this.editPlantData
        );
        if (response) {
          this.resetPlant();
          this.$emit("edited");
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while editing the plant");
      }
    },
    async deletePlant() {
      try {
        this.loadingTimeout();
        const response = await PlantService.deletePlant(this.plant.id);
        if (response) {
          this.resetPlant();
          this.$emit("close");
          await this.$router.push({ name: "plant-overview" });
        }
      } catch (error) {
        console.error("Error:", error);
        ToastService.showError("Error while deleting the plant");
      }
    },
    loadingTimeout() {
      this.isLoading = true;
      const timeout_s = 10;
      setTimeout(() => {
        this.isLoading = false;
      }, timeout_s * 1000);
    },
    resetPlant() {
      this.editPlantData = {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
      };
      this.isLoading = false;
    },
  },
});
</script>
