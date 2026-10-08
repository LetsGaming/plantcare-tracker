<template>
  <IonHeader>
    <IonToolbar>
      <h1 class="modal-title">{{ translateHeader(headerTitle) }}</h1>
      <IonButtons slot="end">
        <slot name="actions" />
        <IconButton :icon="icons.close" :label="closeLabel" @press="$emit('close')" />
      </IonButtons>
    </IonToolbar>
  </IonHeader>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonHeader, IonButtons, IonToolbar } from "@ionic/vue";
import IconButton from "@/components/ui/IconButton.vue";
import { icons } from "@/theme/icons";
import localizationService from "@/services/general/LocalizationService";

/** The one modal header: title on the left (wrapping to two lines), close always at the end. */
export default defineComponent({
  name: "ModalHeader",
  emits: ["close"],
  components: {
    IonHeader,
    IonButtons,
    IonToolbar,
    IconButton,
  },
  props: {
    headerTitle: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { icons };
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

<style scoped>
.modal-title {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.25;
  text-align: left;
  overflow-wrap: anywhere;
}
</style>
