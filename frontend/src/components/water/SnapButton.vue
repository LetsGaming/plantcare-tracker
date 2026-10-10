<template>
  <div class="snap-button">
    <ion-button
      ref="button"
      class="snap-trigger"
      size="large"
      color="tertiary"
      :fill="fill"
      :disabled="disabled"
      @click="openCamera"
    >
      <ion-icon :icon="icons.camera" slot="start" aria-hidden="true" />
      {{ t("water.snap") }}
    </ion-button>
    <input
      ref="input"
      class="file-input"
      type="file"
      accept="image/*"
      capture="environment"
      tabindex="-1"
      aria-hidden="true"
      @change="onChange"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { icons } from "@/theme/icons";
import localizationService from "@/services/general/LocalizationService";
import { checkImageFile } from "@/utils/imageValidation";

export default defineComponent({
  name: "SnapButton",
  components: { IonButton, IonIcon },
  props: {
    disabled: { type: Boolean, default: false },
    fill: { type: String as PropType<"solid" | "outline">, default: "solid" },
  },
  emits: ["photo", "invalid"],
  setup() {
    return { icons };
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    focusButton() {
      const button = this.$refs.button as { $el?: HTMLElement } | undefined;
      button?.$el?.focus();
    },
    openCamera() {
      (this.$refs.input as HTMLInputElement | undefined)?.click();
    },
    onChange(event: Event) {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (!file) return;
      const problem = checkImageFile(file);
      if (problem) this.$emit("invalid", problem);
      else this.$emit("photo", file);
    },
  },
});
</script>

<style scoped>
.snap-button {
  min-width: 0;
}

.snap-trigger {
  min-height: var(--tap-min);
  margin: 0;
}

.file-input {
  display: none;
}
</style>
