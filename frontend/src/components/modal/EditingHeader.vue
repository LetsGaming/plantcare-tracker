<template>
  <ModalHeader :header-title="headerTitle" @close="$emit('close')">
    <template v-if="showEditButton && onEditClick" #actions>
      <IconButton :icon="icons.edit" :label="t('a11y.edit', 'Edit')" @press="onEditClick" />
    </template>
  </ModalHeader>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import IconButton from "@/components/ui/IconButton.vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import { icons } from "@/theme/icons";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "EditModalHeader",
  emits: ["close"],
  components: {
    ModalHeader,
    IconButton,
  },
  props: {
    headerTitle: {
      type: String,
      required: true,
    },
    showEditButton: {
      type: Boolean,
      default: false,
    },
    onEditClick: {
      type: Function as PropType<() => void>,
      required: false,
    },
  },
  setup() {
    return { icons };
  },
  methods: {
    t(key: string, fallback: string) {
      return localizationService.t(key, undefined, fallback);
    },
  },
});
</script>
