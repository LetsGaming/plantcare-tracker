<template>
  <ion-content>
    <!-- Pull to Refresh -->
    <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
      <ion-refresher-content
        :pulling-icon="chevronDown"
        pulling-text="Ziehen um zu aktualisieren"
        refreshing-spinner="circles"
        refreshing-text="Aktualisiere..."
      />
    </ion-refresher>

    <!-- Manual Refresh Button -->
    <div class="refresh-button-container">
      <ion-button
        size="small"
        fill="clear"
        @click="manualRefresh"
        :disabled="isRefreshing"
      >
        <template v-if="isRefreshing">
          <ion-spinner name="dots" />
          Lädt...
        </template>
        <template v-else>
          <ion-icon :icon="refresh" />
        </template>
      </ion-button>
    </div>

    <!-- Content inside the ion-content -->
    <div class="content-container">
      <slot />
    </div>
  </ion-content>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonButton,
  IonIcon,
  IonSpinner,
} from "@ionic/vue";
import { chevronDownCircleOutline, refresh } from "ionicons/icons";

export default defineComponent({
  name: "PullToRefresh",
  components: {
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonSpinner,
  },
  props: {
    onRefresh: {
      type: Function as PropType<() => Promise<void>>,
      required: true,
    },
  },
  data() {
    return {
      chevronDown: chevronDownCircleOutline,
      refresh: refresh,
      isRefreshing: false,
    };
  },
  methods: {
    handleRefresh(event: any) {
      this.isRefreshing = true;
      this.onRefresh().then(() => {
        event.target.complete();
        this.isRefreshing = false;
      });
    },
    manualRefresh() {
      this.isRefreshing = true;
      this.onRefresh().then(() => {
        this.isRefreshing = false;
      });
    },
  },
});
</script>

<style scoped>
/* Container for the refresh button */
.refresh-button-container {
  position: absolute;
  left: 95%;
  padding: 8px 16px;
}

/* Main content container */
.content-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* Customize refresher styling */
ion-refresher {
  --background: #f0f0f0;
  --pulling-icon-color: #3880ff;
  --refreshing-icon-color: #3880ff;
}

/* Ensure scrollability and remove default padding */
ion-content {
  --padding-top: 0;
  --padding-bottom: 0;
}
</style>
