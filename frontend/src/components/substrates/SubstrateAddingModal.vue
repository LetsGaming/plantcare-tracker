<template>
  <SubstrateFormModal
    :is-open="isOpen"
    :is-loading="isLoading"
    title="substrate.add.title"
    selection-title="substrate.select_components_title"
    :available-components="availableComponents"
    allow-image
    @save="$emit('save', $event)"
    @close="$emit('close')"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import SubstrateFormModal from "@/components/substrates/SubstrateFormModal.vue";

export default defineComponent({
  name: "SubstrateAddingModal",
  emits: ["close", "save"],
  components: { SubstrateFormModal },
  props: {
    isOpen: { type: Boolean, required: true },
    isLoading: { type: Boolean, default: false },
    availableComponents: {
      type: Array as PropType<SubstrateComponent[]>,
      required: true,
    },
  },
});
</script>
