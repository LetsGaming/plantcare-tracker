<template>
  <div class="banner" role="alert">
    <ion-icon :icon="alertCircleOutline" aria-hidden="true" />
    <p class="text">{{ t("admin3.refresh_failed") }}</p>
    <ion-button fill="clear" class="retry" :disabled="busy" @click="$emit('retry')">
      {{ t("state.retry") }}
    </ion-button>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { alertCircleOutline } from "ionicons/icons";

import localizationService from "@/services/general/LocalizationService";

/** Persistent notice that a refresh failed while older data stays on screen. */
export default defineComponent({
  name: "RefreshErrorBanner",
  components: { IonButton, IonIcon },
  props: {
    busy: { type: Boolean, default: false },
  },
  emits: ["retry"],
  setup() {
    return { alertCircleOutline };
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--clay-wash);
  color: var(--ion-text-color);
}

.banner ion-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: var(--ion-color-danger);
}

.text {
  margin: 0;
  flex: 1;
  font-size: var(--text-sm);
}

.retry {
  flex-shrink: 0;
  min-height: var(--tap-min);
  margin: 0;
}
</style>
