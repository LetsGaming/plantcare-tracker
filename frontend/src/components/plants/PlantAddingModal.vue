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
    @submit="submit"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";

export default defineComponent({
  name: "PlantAddingModal",
  components: { BaseFormModal, SubstrateContainer },
  emits: ["close", "save"],
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    substrates: {
      type: Array as PropType<Substrate[]>,
      required: true,
    },
  },
  setup() {
    return { SubstrateContainer };
  },
  data() {
    return {
      plant: {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
        image: undefined as File | undefined,
      } as AddPlant,
    };
  },
  computed: {
    plantFormFields() {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "plant.field.name",
          required: true,
        },
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
          options: this.substrates.map((s) => ({
            value: s.id,
            label: s.name,
          })),
          required: true,
        },
        {
          type: "radio",
          modelKey: "isPublic",
          label: "plant.field.visibility",
          options: [
            { value: true, label: "plant.visibility.public" },
            { value: false, label: "plant.visibility.private" },
          ],
          defaultValue: Boolean(this.plant.isPublic),
        },
        {
          type: "file",
          modelKey: "image",
          label: "plant.image.upload",
        },
      ] as FormField[];
    },

    selectedSubstrate() {
      return this.substrates.find((s) => s.id === this.plant.substrateId);
    },
  },
  methods: {
    submit() {
      this.$emit("save", { ...this.plant });
      this.resetPlantData();
    },
    resetPlantData() {
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
