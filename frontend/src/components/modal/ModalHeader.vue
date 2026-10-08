<template>
  <IonHeader>
    <IonToolbar>
      <IonTitle>{{ translateHeader(headerTitle) }}</IonTitle>
      <IonButtons slot="end">
        <IconButton :icon="close" :label="closeLabel" @press="$emit('close')" />
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonHeader, IonButtons, IonToolbar, IonTitle } from "@ionic/vue";
import { close } from "ionicons/icons";
import IconButton from "@/components/ui/IconButton.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ModalHeader",
  emits: ["close"],
  components: {
    IonHeader,
    IonButtons,
    IonToolbar,
    IonTitle,
    IconButton,
  },
  props: {
    headerTitle: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { close };
  },
  computed: {
    closeLabel(): string {
      return localizationService.t("a11y.close", undefined, "Close");
    },
  },
  methods: {
    translateHeader(value: string) {
      return localizationService.t(value, undefined, value);
    },
  },
});
</script>
