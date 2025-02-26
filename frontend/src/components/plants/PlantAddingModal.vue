<template>
  <BaseModal
    :isOpen="isOpen"
    modalTitle="Pflanze hinzufügen"
    formTitle="Pflanzen Informationen"
    submitLabel="Pflanze hinzufügen"
    :formData="plant"
    :formFields="plantFormFields"
    :extra-content-component="SubstrateContainer"
    :extra-content-data="{ substrate: selectedSubstrate }"
    @submit="addPlant"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import BaseModal from "@/components/modal/BaseAddingModal.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import PlantService from "@/services/PlantService";
import ToastService from "@/services/general/ToastService";
import SubstrateService from "@/services/SubstrateService";

export default defineComponent({
  name: "PlantAddingModal",
  components: { BaseModal },
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
    };
  },
  setup() {
    return {
      SubstrateContainer,
    };
  },
  async mounted() {
    await this.fetchSubstrates();
  },
  computed: {
    plantFormFields() {
      return [
        { type: "input", modelKey: "name", label: "Name", required: true },
        {
          type: "input",
          modelKey: "species",
          label: "Spezies",
          required: true,
        },
        {
          type: "select",
          modelKey: "substrateId",
          label: "Substrat",
          placeholder: "Substrat auswählen",
          options: this.substrates.map((substrate: any) => ({
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
        },
        { type: "file", modelKey: "image", label: "Bild hochladen" },
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
        const response = await SubstrateService.getSubstrates(
          this.plant.isPublic || false
        );
        this.substrates = response;
      } catch (error) {
        console.error("Error fetching substrates:", error);
      }
    },
    async addPlant(plantData: AddPlant) {
      try {
        const response = await PlantService.addPlant(plantData);
        if (!response) return;
        if (plantData.image) {
          await this.upladImage(response.plantId, plantData.image);
        }
        this.$emit("added");
      } catch (error) {
        ToastService.showError("Fehler beim Hinzufügen der Pflanze");
      }
    },
    async upladImage(id: number, image: File) {
      try {
        const response = await PlantService.uploadPlantImage(id, image);
        if (response) {
          ToastService.showSuccess("Bild erfolgreich hochgeladen");
        }
      } catch (error) {
        ToastService.showError("Fehler beim Hochladen des Bildes");
      }
    },
  },
});
</script>
