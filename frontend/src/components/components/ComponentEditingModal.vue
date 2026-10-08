<template>
  <BaseFormModal
    :is-open="isOpen"
    modal-title="component.edit.title"
    :form-data="editComponentData"
    :form-fields="componentFormFields"
    form-title="components.add.form_title"
    submit-label="component.edit.submit"
    :is-loading="isLoading"
    @submit="submit"
    @close="$emit('close')"
    :delete-handler="emitDelete"
    :delete-label="component.name"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "../modal/BaseFormModal.vue";
import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";

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
  async created() {
    this.resetFromComponent();
    await this.ensureFinenessLevels();
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.resetFromComponent();
    },
    "component.id"() {
      this.resetFromComponent();
    },
  },
  computed: {
    ...mapState(useComponentsStore, ["finenessLevels"]),
    componentFormFields(): FormField[] {
      return [
        {
          type: "input",
          modelKey: "name",
          label: "component.field.name",
          required: true,
          autocapitalize: "words",
          enterkeyhint: "next",
        },
        {
          type: "select",
          modelKey: "fineness",
          label: "component.field.fineness",
          required: true,
          placeholder: "component.field.fineness_placeholder",
          options: this.finenessLevels.map((f) => ({
            value: f.fineness_id,
            label: f.fineness_name,
          })),
        },
      ];
    },
  },
  methods: {
    ...mapActions(useComponentsStore, ["ensureFinenessLevels"]),
    submit() {
      this.$emit("save", { ...this.editComponentData });
    },
    emitDelete() {
      this.$emit("delete", this.component.id);
    },
    resetFromComponent() {
      this.editComponentData = {
        name: this.component.name,
        fineness: this.component.finenessId,
      };
    },
  },
});
</script>
