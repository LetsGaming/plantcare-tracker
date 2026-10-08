<template>
  <ion-app>
    <offline-banner />
    <ion-split-pane content-id="main" when="(min-width: 992px)" :disabled="!showShell">
      <side-menu v-if="showShell" />
      <ion-router-outlet id="main" />
    </ion-split-pane>
  </ion-app>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonApp, IonRouterOutlet, IonSplitPane } from "@ionic/vue";
import SideMenu from "./components/SideMenu.vue";
import OfflineBanner from "./components/ui/OfflineBanner.vue";

export default defineComponent({
  name: "App",
  components: { IonApp, IonRouterOutlet, IonSplitPane, SideMenu, OfflineBanner },
  computed: {
    /** The menu belongs to signed-in screens only: not login, not the top-level 404. */
    showShell(): boolean {
      return this.$route?.meta?.requiresAuth === true;
    },
  },
});
</script>
