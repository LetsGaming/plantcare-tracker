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
import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";
import { finenessLabel } from "@/utils/enumLabels";

const blankComponent = (): AddComponent => ({
  name: "",
  finenessId: 0,
  image: undefined,
});

export default defineComponent({
  name: "ComponentAddingModal",
  components: { BaseFormModal },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
  },
  emits: ["close", "save"],
  data() {
    return { componentData: blankComponent() };
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.componentData = blankComponent();
    },
  },
  async created() {
    await this.ensureFinenessLevels();
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
          modelKey: "finenessId",
          label: "component.field.fineness",
          required: true,
          placeholder: "component.field.fineness_placeholder",
          options: this.finenessLevels.map((f) => ({
            value: f.fineness_id,
            label: finenessLabel(f.fineness_name),
          })),
        },
        { type: "file", modelKey: "image", label: "component.image.upload" },
      ];
    },
  },
  methods: {
    ...mapActions(useComponentsStore, ["ensureFinenessLevels"]),
    submit() {
      this.$emit("save", { ...this.componentData });
    },
  },
});
</script>
