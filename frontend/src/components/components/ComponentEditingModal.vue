<template>
  <base-modal
    :is-open="isOpen"
    modal-title="Komponente bearbeiten"
    :form-data="editComponentData"
    :form-fields="[
      { type: 'input', modelKey: 'name', label: 'Name', required: false },
      {
        type: 'select',
        modelKey: 'fineness',
        label: 'Feinheit',
        placeholder: 'Feinheit auswählen',
        options: [
          { value: '1', label: 'Grob' },
          { value: '2', label: 'Mittel' },
          { value: '3', label: 'Fein' },
        ],
        required: false,
      },
    ]"
    form-title="Komponenten Informationen"
    submit-label="Komponente editieren"
    :is-loading="isLoading"
    @close="$emit('close')"
    @submit-click="editComponent"
    @delete-click="deleteComponent"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseModal from "../modal/BaseModal.vue";

import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "ComponentEditingModal",
  emits: ["close", "edited"],
  components: {
    BaseModal,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    component: {
      type: Object as PropType<SubstrateComponent>,
      required: true,
    },
  },
  data() {
    return {
      editComponentData: {
        name: "",
        fineness: "",
      } as EditComponent,
      isLoading: false,
    };
  },
  mounted() {
    const mapped_fineness = {
      1: "coarse",
      2: "medium",
      3: "fine",
    };

    this.editComponentData = {
      name: this.component.name,
      fineness:
        mapped_fineness[Number(this.component.fineness) as 1 | 2 | 3] || "",
    };
  },
  methods: {
    async editComponent() {
      try {
        if (this.editComponentData.name === "") {
          this.editComponentData.name = this.component.name;
        }
        if (this.editComponentData.fineness === "") {
          this.editComponentData.fineness = this.component.fineness;
        }
        this.isLoading = true;
        const reponse = await ComponentService.editComponent(
          this.component.id,
          this.editComponentData
        );
        if (reponse) {
          this.isLoading = false;
          this.$emit("edited");
        }
      } catch (error) {
        this.isLoading = false;
        console.error(error);
        ToastService.showError("Fehler beim Bearbeiten der Komponente");
      }
    },
    async deleteComponent() {
      try {
        this.isLoading = true;
        const response = await ComponentService.deleteComponent(
          this.component.id
        );
        if (response) {
          this.isLoading = false;
          this.$emit("close");
          this.$router.push({ name: "component-overview" });
        }
      } catch (error) {
        this.isLoading = false;
        console.error(error);
        ToastService.showError("Fehler beim Löschen der Komponente");
      }
    },
  },
});
</script>
