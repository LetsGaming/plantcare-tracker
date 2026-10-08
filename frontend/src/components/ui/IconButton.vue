<template>
  <ion-button
    class="icon-button"
    :fill="fill"
    :color="color"
    :aria-label="label"
    :title="label"
    :disabled="disabled"
    type="button"
    @click="$emit('press', $event)"
  >
    <ion-icon slot="icon-only" :icon="icon" aria-hidden="true" />
  </ion-button>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";

/** The one way to put an icon-only action on screen: named, 44px, keyboard reachable. */
export default defineComponent({
  name: "IconButton",
  components: { IonButton, IonIcon },
  props: {
    icon: { type: String, required: true },
    label: { type: String, required: true },
    color: { type: String, default: undefined },
    fill: { type: String as PropType<"clear" | "outline" | "solid" | "default">, default: "clear" },
    disabled: { type: Boolean, default: false },
  },
  emits: ["press"],
});
</script>

<style scoped>
.icon-button {
  --padding-start: 0;
  --padding-end: 0;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: 0;
}

.icon-button ion-icon {
  width: 24px;
  height: 24px;
}
</style>
