<template>
  <SubstrateFormModal
    :is-open="isOpen"
    :is-loading="isLoading"
    title="substrate.edit.title"
    selection-title="substrate.components.edit.title"
    :substrate="substrate"
    deletable
    @save="$emit('save', $event)"
    @delete="$emit('delete', $event)"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import SubstrateFormModal from "@/components/substrates/SubstrateFormModal.vue";

export default defineComponent({
  name: "SubstrateEditingModal",
  emits: ["close", "save", "delete"],
  components: { SubstrateFormModal },
  props: {
    isOpen: {
      type: Boolean,
      required: true,
    },
    substrate: {
      type: Object as PropType<SubstrateView>,
      required: true,
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
});
</script>
