<template>
  <BaseFormModal
    :is-open="isOpen"
    :is-loading="isLoading"
    modal-title="image.edit.title"
    form-title="image.info.title"
    submit-label="image.edit.submit"
    :form-data="imageEditData"
    :form-fields="formFields"
    :delete-handler="deleteImage"
    :delete-label="deleteLabel"
    @submit="submitForm"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";
import ImageService from "@/services/ImageService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ImageEditingModal",
  emits: ["close", "edited"],
  components: { BaseFormModal },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    image: {
      type: Object as PropType<Image>,
      required: true,
    },
    entityType: {
      type: Object as PropType<EntityType>,
      required: true,
    },
  },
  data() {
    return {
      imageEditData: { file: undefined, date: this.image.date_millis } as EditImage,
      isLoading: false,
    };
  },
  computed: {
    deleteLabel(): string {
      return localizationService.t("image.label", undefined, "Image");
    },
    formFields(): FormField[] {
      return [
        { type: "file", label: "image.field.file", modelKey: "file" },
        { type: "date", label: "image.field.date", modelKey: "date", required: true },
      ];
    },
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.resetDraft();
    },
    "image.id"() {
      this.resetDraft();
    },
  },
  methods: {
    resetDraft() {
      this.imageEditData = { file: undefined, date: this.image.date_millis } as EditImage;
    },
    async submitForm() {
      if (!this.imageEditData.file && !this.imageEditData.date) return;
      this.isLoading = true;
      try {
        const response = await ImageService.editImage(
          this.image.id,
          this.imageEditData.date,
          this.imageEditData.file,
        );
        if (response) this.$emit("edited");
      } catch {
        // handleRequest has already reported the failure.
      } finally {
        this.isLoading = false;
      }
    },
    async deleteImage() {
      this.isLoading = true;
      try {
        await ImageService.deleteImage(this.image.id);
        this.$emit("edited");
      } finally {
        this.isLoading = false;
      }
    },
  },
});
</script>
