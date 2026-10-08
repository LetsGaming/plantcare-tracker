<template>
  <div class="offline-region" role="status" aria-live="polite">
    <p v-if="message" :key="mode" class="offline-banner" :class="`is-${mode}`">{{ message }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import localizationService from "@/services/general/LocalizationService";
import { networkState, watchConnectivity } from "@/utils/network";

const CONFIRMATION_MS = 3000;

/** Slim status line shown while the device is offline, with a short confirmation on reconnect. */
export default defineComponent({
  name: "OfflineBanner",
  props: {
    confirmationMs: { type: Number, default: CONFIRMATION_MS },
  },
  data() {
    return {
      showRecovered: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      stopWatching: null as (() => void) | null,
    };
  },
  computed: {
    online(): boolean {
      return networkState.online;
    },
    mode(): "offline" | "online" | "idle" {
      if (!this.online) return "offline";
      return this.showRecovered ? "online" : "idle";
    },
    message(): string {
      if (this.mode === "offline") return localizationService.t("offline.banner");
      if (this.mode === "online") return localizationService.t("offline.backOnline");
      return "";
    },
  },
  watch: {
    online(value: boolean, previous: boolean) {
      this.clearTimer();
      if (value && !previous) {
        this.showRecovered = true;
        this.timer = setTimeout(() => {
          this.showRecovered = false;
          this.timer = null;
        }, this.confirmationMs);
      } else {
        this.showRecovered = false;
      }
    },
  },
  mounted() {
    this.stopWatching = watchConnectivity();
  },
  beforeUnmount() {
    this.stopWatching?.();
    this.clearTimer();
  },
  methods: {
    clearTimer() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
  },
});
</script>

<style scoped>
.offline-region {
  width: 100%;
}

.offline-banner {
  margin: 0;
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  text-align: center;
  color: var(--ion-text-color);
  animation: offline-in 0.2s var(--ease-out);
}

.offline-banner.is-offline {
  background: var(--clay-wash);
}

.offline-banner.is-online {
  background: var(--leaf-wash);
}

@keyframes offline-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
