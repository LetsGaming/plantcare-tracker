<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="components.add.title"
    formTitle="components.add.form_title"
    submitLabel="components.add.submit"
    :formData="componentData"
    :formFields="componentFormFields"
    :isLoading="isLoading"
    @submit="submit"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import ComponentService from "@/services/ComponentService";

export default defineComponent({
  name: "ComponentAddingModal",
  components: { BaseFormModal },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
  },
  emits: ["close", "save"],
  data() {
    return {
      componentData: {
        name: "",
        finenessId: 0,
        image: undefined,
      } as AddComponent,
      finenessLevels: [] as APIFinenessLevel[],
    };
  },
  async created() {
    this.finenessLevels = await ComponentService.getFinenessLevels();
  },
  computed: {
    componentFormFields(): FormField[] {
      return [
        { type: "input", modelKey: "name", label: "component.field.name" },
        {
          type: "select",
          modelKey: "finenessId",
          label: "component.field.fineness",
          placeholder: "component.field.fineness_placeholder",
          options: this.finenessLevels.map((f) => ({
            value: f.fineness_id,
            label: f.fineness_name,
          })),
        },
        { type: "file", modelKey: "image", label: "component.image.upload" },
      ];
    },
  },
  methods: {
    submit() {
      this.$emit("save", { ...this.componentData });
      this.clearComponentData();
    },
    clearComponentData() {
      this.componentData = { name: "", finenessId: 0, image: undefined };
    },
  },
});
</script>