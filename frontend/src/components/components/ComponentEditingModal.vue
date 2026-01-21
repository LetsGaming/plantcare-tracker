<template>
  <BaseFormModal
    :is-open="isOpen"
    modal-title="'component.edit.title'"
    :form-data="editComponentData"
    :form-fields="componentFormFields"
    :form-title="'components.add.form_title'"
    submit-label="'component.edit.submit'"
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
  watch: {
    component: {
      immediate: true,
      handler() {
        this.resetFromComponent();
      },
    },
  },
  computed: {
    componentFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "component.field.name",
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
        },
      ];
    },
  },
  methods: {
    submit() {
      this.$emit("save", { ...this.editComponentData });
    },
    emitDelete() {
      this.$emit("delete", this.component.id);
    },
    resetFromComponent() {
      this.editComponentData = {
        name: this.component.name,
        fineness: 0,
      };
    },
  },
});
</script>
