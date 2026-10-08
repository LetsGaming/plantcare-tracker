<template>
  <IonHeader>
    <IonToolbar>
      <IonTitle>{{ headerTitle }}</IonTitle>
      <IonButtons slot="start">
        <IconButton :icon="close" :label="t('a11y.close', 'Close')" @press="$emit('close')" />
      </IonButtons>
      <IonButtons v-if="showEditButton && onEditClick" slot="end">
        <IconButton :icon="create" :label="t('a11y.edit', 'Edit')" @press="onEditClick" />
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<script lang="ts">
import { IonHeader, IonToolbar, IonButtons, IonTitle } from "@ionic/vue";
import { defineComponent, PropType } from "vue";
import { close, create } from "ionicons/icons";
import IconButton from "@/components/ui/IconButton.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "EditModalHeader",
  emits: ["close"],
  components: {
    IonHeader,
    IonToolbar,
    IonButtons,
    IonTitle,
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
    return { close, create };
  },
  methods: {
    t(key: string, fallback: string) {
      return localizationService.t(key, undefined, fallback);
    },
  },
});
</script>
