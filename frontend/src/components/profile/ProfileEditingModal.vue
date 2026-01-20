<template>
  <BaseFormModal
    :isOpen="isOpen"
    modalTitle="profile.edit.title"
    formTitle="profile.edit.form_title"
    submitLabel="profile.edit.submit"
    :formData="profileData"
    :formFields="formFields"
    :is-loading="isLoading"
    @submit="submit"
    @close="$emit('close')"
    :show-delete="showDelete"
    @delete-click="$emit('delete')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import BaseFormModal from "@/components/modal/BaseFormModal.vue";

export default defineComponent({
  name: "ProfileEditingModal",
  components: { BaseFormModal },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    profileData: {
      type: Object as PropType<EditProfile>,
      required: true,
    },
    formFields: {
      type: Array as PropType<FormField[]>,
      required: true,
    },
    showDelete: { type: Boolean, default: false },
  },
  emits: ["close", "save", "delete"],
  methods: {
    submit() {
      this.$emit("save", { ...this.profileData });
    },
  },
});
</script>
