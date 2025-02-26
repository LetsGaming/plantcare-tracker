<template>
  <BaseModal
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
import BaseModal from "@/components/modal/BaseAddingModal.vue";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ComponentAddingModal",
  components: { BaseModal },
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
        const response = await ComponentService.addComponent(componentData);
        if (response) this.$emit("added");
      } catch (error) {
        ToastService.showError("Fehler beim Hinzufügen der Komponente");
      }
    },
  },
});
</script>
