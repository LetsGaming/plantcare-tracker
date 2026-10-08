<template>
  <BaseFormModal
    :is-open="isOpen"
    :is-loading="isLoading"
    :modal-title="cardTitle"
    form-title="image.upload.title"
    submit-label="image.upload.submit"
    :form-data="fileItem"
    :form-fields="formFields"
    @submit="submitForm"
    @close="onClose"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";

const blankItem = (): AddImage => ({ date: undefined, file: undefined }) as unknown as AddImage;

export default defineComponent({
  name: "ImageUploadModal",
  emits: ["submit"],
  components: { BaseFormModal },
  props: {
    isLoading: {
      type: Boolean,
      required: true,
    },
    isOpen: {
      type: Boolean,
      required: true,
    },
    cardTitle: {
      type: String,
      required: true,
    },
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  data() {
    return { fileItem: blankItem() };
  },
  computed: {
    formFields(): FormField[] {
      return [
        { type: "file", label: "image.label", modelKey: "file", required: true },
        { type: "date", label: "image.date_label", modelKey: "date" },
      ];
    },
  },
  watch: {
    isOpen() {
      this.fileItem = blankItem();
    },
  },
  methods: {
    submitForm() {
      if (this.fileItem.file) this.$emit("submit", this.fileItem);
    },
  },
});
</script>
