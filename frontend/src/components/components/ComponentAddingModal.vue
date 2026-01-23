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
        fineness: -1,
        image: undefined,
      } as AddComponent,
      
    };
  },
  computed: {
    componentFormFields(): FormField[] {
      return [
        { type: "input", modelKey: "name", label: "component.field.name" },
        {
          type: "select",
          modelKey: "fineness",
          label: "component.field.fineness",
          placeholder: "component.field.fineness_placeholder",
          options: [
            { value: 1, label: "component.fineness.coarse" },
            { value: 2, label: "component.fineness.medium" },
            { value: 3, label: "component.fineness.fine" },
          ],
        },
        { type: "file", modelKey: "image", label: "component.image.upload" },
      ];
    },
  },
  methods: {
    submit() {
      // emit the current form data to the parent
      this.$emit("save", { ...this.componentData });
      this.clearComponentData();
    },
    clearComponentData() {
      this.componentData = { name: "", fineness: -1, image: undefined };
    },
  },
});
</script>
