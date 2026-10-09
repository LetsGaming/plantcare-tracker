<template>
  <div class="snap-button">
    <ion-button
      class="snap-trigger"
      size="large"
      color="tertiary"
      :disabled="disabled"
      :aria-label="t('water.snap')"
      @click="openCamera"
    >
      <ion-icon :icon="icons.camera" slot="icon-only" aria-hidden="true" />
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
import { defineComponent } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { icons } from "@/theme/icons";
import localizationService from "@/services/general/LocalizationService";
import { checkImageFile } from "@/utils/imageValidation";

export default defineComponent({
  name: "SnapButton",
  components: { IonButton, IonIcon },
  props: {
    disabled: { type: Boolean, default: false },
  },
  emits: ["photo", "invalid"],
  setup() {
    return { icons };
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
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
  flex: none;
}

.snap-trigger {
  --padding-start: 0;
  --padding-end: 0;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: 0;
}

.file-input {
  display: none;
}
</style>
