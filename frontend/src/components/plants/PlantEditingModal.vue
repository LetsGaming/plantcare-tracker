<template>
  <BaseFormModal
    :isOpen="isOpen"
    :isLoading="isLoading"
    :modalTitle="t('plant.edit.title')"
    :formTitle="t('plant.edit.form_title')"
    :submitLabel="t('plant.edit.submit')"
    :formData="editPlantData"
    :formFields="formFields"
    :extraContentComponent="SubstrateContainer"
    :extraContentData="{ substrate: selectedSubstrate }"
    :deleteHandler="onDelete"
    @submit="submit"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType, watch } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PlantEditingModal",
  components: {
    BaseFormModal,
    SubstrateContainer,
  },
  emits: ["close", "save", "delete"],
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    plant: {
      type: Object as PropType<Plant>,
      required: true,
    },
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
      editPlantData: {
        name: "",
        species: "",
        substrateId: 0,
        isPublic: false,
      } as EditPlant,
    };
  },

  watch: {
    plant: {
      immediate: true,
      deep: true,
      handler()  {
        this.resetFromPlant();
      },
    },
  },

  computed: {
    formFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "plant.field.name",
        },
        {
          type: "input",
          modelKey: "species",
          label: "plant.field.species",
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
      ];
    },

    selectedSubstrate() {
      return this.substrates.find(
        (s) => s.id === this.editPlantData.substrateId,
      );
    },
  },

  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },

    submit() {
      this.$emit("save", { ...this.editPlantData });
    },

    onDelete() {
      this.$emit("delete");
    },

    resetFromPlant() {
      this.editPlantData = {
        name: this.plant.name,
        species: this.plant.species,
        substrateId: this.plant.substrate.id,
        isPublic: this.plant.isPublic
      };
    },
  },
});
</script>
