<template>
  <BaseFormModal
    :is-open="isOpen"
    modal-title="component.edit.title"
    :form-data="editComponentData"
    :form-fields="componentFormFields"
    :form-title="t('components.add.form_title')"
    submit-label="component.edit.submit"
    :is-loading="isLoading"
    @submit="submit"
    @close="$emit('close')"
    :delete-handler="emitDelete"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "../modal/BaseFormModal.vue";

export default defineComponent({
  name: "ComponentEditingModal",
  components: { BaseFormModal },
  props: {
    isOpen: { type: Boolean, required: true },
    component: { type: Object as PropType<Component>, required: true },
    isLoading: { type: Boolean, default: false },
  },
  emits: ["close", "save", "delete"],
  data() {
    return {
      editComponentData: {
        name: "",
        fineness: 0,
      } as EditComponent,
    };
  },
  mounted() {
    this.editComponentData = {
      name: this.component.name,
      fineness: Number(this.component.fineness) || 0,
    };
  },
  computed: {
    componentFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: this.t("component.field.name"),
        },
        {
          type: "select",
          modelKey: "fineness",
          label: this.t("component.field.fineness"),
          placeholder: this.t("component.field.fineness_placeholder"),
          options: [
            { value: "1", label: this.t("component.fineness.coarse") },
            { value: "2", label: this.t("component.fineness.medium") },
            { value: "3", label: this.t("component.fineness.fine") },
          ],
        },
      ];
    },
  },
  methods: {
    t(key: string) {
      return key; // keep it simple, parent handles localization
    },
    submit() {
      this.$emit("save", { ...this.editComponentData });
    },
    emitDelete() {
      this.$emit("delete", this.component.id);
    },
  },
});
</script>
