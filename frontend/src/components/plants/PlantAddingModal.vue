<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="plant.add.title"
    formTitle="plant.add.form_title"
    submitLabel="plant.add.submit"
    :formData="plant"
    :formFields="plantFormFields"
    :extra-content-component="SubstrateContainer"
    :extra-content-data="{ substrate: selectedSubstrate }"
    :is-loading="isLoading"
    @submit="addPlant"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import PlantService from "@/services/PlantService";
import ToastService from "@/services/general/ToastService";
import SubstrateService from "@/services/SubstrateService";

export default defineComponent({
  name: "PlantAddingModal",
  components: { BaseFormModal },
  props: { isOpen: { type: Boolean, required: true } },
  emits: ["close", "added"],
  data() {
    return {
      plant: {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
        image: undefined,
      } as AddPlant,
      substrates: [] as Substrate[],
      isLoading: false,
    };
  },
  setup() {
    return {
      SubstrateContainer,
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
    plantFormFields() {
      return [
          { type: "input", modelKey: "name", label: "plant.field.name", required: true },
        {
            type: "input",
            modelKey: "species",
            label: "plant.field.species",
            required: true,
        },
        {
          type: "select",
          modelKey: "substrateId",
            label: "plant.field.substrate",
            placeholder: "plant.field.substrate_placeholder",
          options: this.substrates.map((substrate: any) => ({
            value: substrate.id,
            label: substrate.name,
          })),
          required: true,
        },
        {
          type: "radio",
          modelKey: "isPublic",
            label: "plant.field.visibility",
            options: [
              { value: true, label: 'plant.visibility.public' },
              { value: false, label: 'plant.visibility.private' },
            ],
          defaultValue: Boolean(this.plant.isPublic),
        },
          { type: "file", modelKey: "image", label: "plant.image.upload" },
      ] as FormField[];
    },
    selectedSubstrate() {
      return this.substrates.find(
        (substrate) => substrate.id === this.plant.substrateId
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
    async addPlant(plantData: AddPlant) {
      // Validate required parameters.
      // Assuming a substrateId of 0 means nothing is selected.
      if (
        !plantData.name.trim() ||
        !plantData.species.trim() ||
        plantData.substrateId === 0
      ) {
        ToastService.showError({ key: 'plant.add.error_required', fallback: 'Please fill in all required fields.' });
        return;
      }

      try {
        this.loadingTimeout();
        const response = await PlantService.addPlant(plantData);
        if (!response) return;
        if (plantData.image) {
          await this.upladImage(response.plantId, plantData.image);
        }
        this.isLoading = false;
        this.clearPlantData();
        this.$emit("added");
      } catch (error) {
        ToastService.showError({ key: 'plant.add.error_failed', fallback: 'Failed to add plant.' });
      }
    },
    async upladImage(id: number, image: File) {
      try {
        const response = await PlantService.uploadPlantImage(id, image);
        if (response) {
          ToastService.showSuccess({ key: 'plant.add.upload_success', fallback: 'Image uploaded successfully.' });
        }
      } catch (error) {
        ToastService.showError({ key: 'plant.add.upload_failed', fallback: 'Failed to upload image.' });
      }
    },
    loadingTimeout() {
      this.isLoading = true;
      const timeout_s = 10;
      setTimeout(() => {
        this.isLoading = false;
      }, timeout_s * 1000);
    },
    clearPlantData() {
      this.plant = {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
        image: undefined,
      };
    },
  },
});
</script>
