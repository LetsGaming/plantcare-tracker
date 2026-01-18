<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="components.add.title"
    formTitle="components.add.form_title"
    submitLabel="components.add.submit"
    :formData="component"
    :formFields="componentFormFields"
    :isLoading="isLoading"
    @submit="addComponent"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ComponentAddingModal",
  components: { BaseFormModal },
  props: { isOpen: { type: Boolean, required: true } },
  emits: ["close", "added"],
  data() {
    return {
      component: { name: "", fineness: -1, image: undefined } as AddComponent,
      isLoading: false,
    };
  },
  computed: {
    componentFormFields() {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "component.field.name",
          required: true,
        },
        {
          type: "select",
          modelKey: "fineness",
          label: "component.field.fineness",
          placeholder: "component.field.fineness_placeholder",
          options: [
            { value: "1", label: "component.fineness.coarse" },
            { value: "2", label: "component.fineness.medium" },
            { value: "3", label: "component.fineness.fine" },
          ],
          required: true,
        },
        { type: "file", modelKey: "image", label: "component.image.upload" },
      ] as FormField[];
    },
  },
  methods: {
    async addComponent(componentData: AddComponent) {
      try {
        if (
          !componentData.name ||
          !componentData.fineness ||
          componentData.fineness < 0
        ) {
          ToastService.showError({
            key: "components.add.error_required",
            fallback: "Please fill in all required fields.",
          });
          return;
        }
        this.isLoading = true;
        const response = await ComponentService.addComponent(componentData);
        if (!response) return;
        if (componentData.image) {
          await this.uploadImage(response.id, componentData.image);
        }
        this.isLoading = false;
        this.clearComponentData();
        this.$emit("added");
      } catch (error) {
        this.isLoading = false;
        ToastService.showError({
          key: "components.add.error_failed",
          fallback: "Error adding component",
        });
      }
    },
    async uploadImage(id: number, image: File) {
      try {
        this.isLoading = true;
        const resposne = await ComponentService.uploadComponentImage(id, image);
        if (resposne) {
          this.isLoading = false;
          ToastService.showSuccess({
            key: "components.add.upload_success",
            fallback: "Image uploaded successfully",
          });
        }
      } catch (error) {
        this.isLoading = false;
        ToastService.showError({
          key: "components.add.upload_failed",
          fallback: "Error uploading image",
        });
      }
    },
    clearComponentData() {
      this.component = {
        name: "",
        fineness: -1,
        image: undefined,
      } as AddComponent;
    },
  },
});
</script>
