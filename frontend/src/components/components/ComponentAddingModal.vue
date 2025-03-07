<template>
  <BaseAddingModal
    :isOpen="isOpen"
    modalTitle="Komponente hinzufügen"
    formTitle="Komponenten Informationen"
    submitLabel="Komponente hinzufügen"
    :formData="component"
    :formFields="componentFormFields"
    @submit="addComponent"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import BaseAddingModal from "@/components/modal/BaseModal.vue";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ComponentAddingModal",
  components: { BaseAddingModal },
  props: { isOpen: { type: Boolean, required: true } },
  emits: ["close", "added"],
  data() {
    return {
      component: { name: "", fineness: "", image: undefined } as AddComponent,
    };
  },
  computed: {
    componentFormFields() {
      return [
        { type: "input", modelKey: "name", label: "Name", required: true },
        {
          type: "input",
          modelKey: "fineness",
          label: "Feinheit",
          required: true,
        },
        { type: "file", modelKey: "image", label: "Bild hochladen" },
      ] as FormField[];
    },
  },
  methods: {
    async addComponent(componentData: AddComponent) {
      try {
        if (!componentData.name || !componentData.fineness) {
          ToastService.showError("Bitte füllen Sie alle erforderlichen Felder aus.");
          return;
        }
        const response = await ComponentService.addComponent(componentData);
        if (!response) return;
        if (componentData.image) {
          await this.uploadImage(response.id, componentData.image);
        }
        this.clearComponentData();
        this.$emit("added");
      } catch (error) {
        ToastService.showError("Fehler beim Hinzufügen der Komponente");
      }
    },
    async uploadImage(id: number, image: File) {
      try {
        await ComponentService.uploadComponentImage(id, image);
      } catch (error) {
        ToastService.showError("Fehler beim Hochladen des Bildes");
      }
    },
    clearComponentData() {
      this.component = { name: "", fineness: "", image: undefined };
    },
  },
});
</script>
