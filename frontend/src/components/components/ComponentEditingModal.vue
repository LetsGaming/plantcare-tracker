<template>
  <BaseFormModal
    :is-open="isOpen"
    modal-title="component.edit.title"
    :form-data="editComponentData"
    :form-fields="[
      { type: 'input', modelKey: 'name', label: t('component.field.name'), required: false },
      {
        type: 'select',
        modelKey: 'fineness',
        label: t('component.field.fineness'),
        placeholder: t('component.field.fineness_placeholder'),
        options: [
          { value: '1', label: t('component.fineness.coarse') },
          { value: '2', label: t('component.fineness.medium') },
          { value: '3', label: t('component.fineness.fine') },
        ],
        required: false,
      },
    ]"
    :form-title="t('components.add.form_title')"
    submit-label="component.edit.submit"
    :is-loading="isLoading"
    :delete-handler="deleteComponent"
    @close="$emit('close')"
    @submit="editComponent"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "../modal/BaseFormModal.vue";

import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ComponentEditingModal",
  emits: ["close", "edited"],
  components: {
    BaseFormModal,
  },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    component: {
      type: Object as PropType<Component>,
      required: true,
    },
  },
  data() {
    return {
      editComponentData: {
        name: "",
        fineness: 0,
      } as EditComponent,
      isLoading: false,
    };
  },
  mounted() {
    this.editComponentData = {
      name: this.component.name,
      fineness: Number(this.component.fineness) || 0,
    };
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async editComponent() {
      try {
        if (!this.editComponentData.name) {
          this.editComponentData.name = this.component.name;
        }
        if (!this.editComponentData.fineness) {
          this.editComponentData.fineness = Number(this.component.fineness);
        }
        this.isLoading = true;
        const reponse = await ComponentService.editComponent(
          this.component.id,
          this.editComponentData
        );
        if (reponse) {
          this.isLoading = false;
          this.resetComponent();
          this.$emit("edited");
        }
      } catch (error) {
        this.isLoading = false;
        ToastService.showError({ key: 'components.edit.error', fallback: 'Error editing component' });
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
          this.resetComponent();
          this.$emit("close");
          this.$router.push({ name: "component-overview" });
        }
      } catch (error) {
        this.isLoading = false;
        console.error(error);
        ToastService.showError({ key: 'components.delete.error', fallback: 'Error deleting component' });
      }
    },
    resetComponent() {
      this.editComponentData = {
        name: "",
        fineness: 0,
      };
      this.isLoading = false;
    },
  },
});
</script>
