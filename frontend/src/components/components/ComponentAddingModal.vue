<template>
  <BaseAddingModal
    :isOpen="isOpen"
    modalTitle="Komponente hinzufügen"
    formTitle="Komponenten Informationen"
    submitLabel="Komponente hinzufügen"
    :formData="component"
    :formFields="componentFormFields"
    :isLoading="isLoading"
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
      component: { name: "", fineness: -1, image: undefined } as AddComponent,
      isLoading: false,
    };
  },
  computed: {
    componentFormFields() {
      return [
        { type: "input", modelKey: "name", label: "Name", required: true },
        {
          type: "select",
          modelKey: "fineness",
          label: "Feinheit",
          placeholder: "Feinheit auswählen",
          options: [
            { value: "1", label: "Grob" },
            { value: "2", label: "Mittel" },
            { value: "3", label: "Fein" },
          ],
          required: true,
        },
        { type: "file", modelKey: "image", label: "Bild hochladen" },
      ] as FormField[];
    },
  },
  methods: {
    async addComponent(componentData: AddComponent) {
      try {
        if (!componentData.name || !componentData.fineness || componentData.fineness < 0) {
          ToastService.showError(
            "Bitte füllen Sie alle erforderlichen Felder aus."
          );
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
        ToastService.showError("Fehler beim Hinzufügen der Komponente");
      }
    },
    async uploadImage(id: number, image: File) {
      try {
        this.isLoading = true;
        const resposne = await ComponentService.uploadComponentImage(id, image);
        if (resposne) {
          this.isLoading = false;
          ToastService.showSuccess("Bild erfolgreich hochgeladen");
        }
      } catch (error) {
        this.isLoading = false;
        ToastService.showError("Fehler beim Hochladen des Bildes");
      }
    },
    clearComponentData() {
      this.component = { name: "", fineness: -1, image: undefined };
    },
  },
});
</script>
