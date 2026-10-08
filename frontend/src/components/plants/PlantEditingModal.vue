<template>
  <BaseFormModal
    :isOpen="isOpen"
    :isLoading="isLoading"
    :modalTitle="t('plant.edit.title')"
    :formTitle="t('plant.edit.form_title')"
    :submitLabel="t('plant.edit.submit')"
    :formData="editPlantData"
    :formFields="formFields"
    :deleteHandler="onDelete"
    :deleteLabel="plant.name"
    :deleteConsequence="t('modal2.plant_delete_consequence')"
    @submit="submit"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PlantEditingModal",
  components: {
    BaseFormModal,
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
  data() {
    return {
      editPlantData: {
        name: "",
        species: "",
        substrateId: undefined,
        isPublic: false,
      } as EditPlant,
    };
  },

  created() {
    this.resetFromPlant();
  },

  watch: {
    isOpen(open: boolean) {
      if (open) this.resetFromPlant();
    },
    "plant.id"() {
      this.resetFromPlant();
    },
  },

  computed: {
    formFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "plant.field.name",
          required: true,
          autocapitalize: "words",
          enterkeyhint: "next",
        },
        {
          type: "input",
          modelKey: "species",
          label: "plant.field.species",
          required: true,
          autocapitalize: "words",
          enterkeyhint: "next",
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
      ];
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
        substrateId: this.plant.substrate?.id,
        isPublic: this.plant.isPublic,
      };
    },
  },
});
</script>
