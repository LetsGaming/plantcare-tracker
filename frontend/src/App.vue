<template>
  <ion-app>
    <offline-banner />
    <ion-split-pane
      content-id="main"
      when="(min-width: 992px)"
      :disabled="!showShell"
      :class="{ 'menu-rail': rail }"
      @ionSplitPaneVisible="pinned = $event.detail.visible"
    >
      <side-menu v-if="showShell" :pinned="pinned" :rail="rail" />
      <ion-router-outlet id="main" />
    </ion-split-pane>
  </ion-app>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonApp, IonRouterOutlet, IonSplitPane } from "@ionic/vue";
import { mapState } from "pinia";
import SideMenu from "./components/SideMenu.vue";
import { useLayoutStore } from "./stores/layout";
import { useSnapSettingsStore } from "./stores/snapSettings";
import OfflineBanner from "./components/ui/OfflineBanner.vue";

export default defineComponent({
  name: "App",
  components: { IonApp, IonRouterOutlet, IonSplitPane, SideMenu, OfflineBanner },
  data() {
    return { pinned: false };
  },
  computed: {
    ...mapState(useLayoutStore, ["menuCollapsed"]),
    /** Pinned beside the content and collapsed to icons by the user. */
    rail(): boolean {
      return this.pinned && this.menuCollapsed;
    },
    /** The menu belongs to signed-in screens only: not login, not the top-level 404. */
    showShell(): boolean {
      return this.$route?.meta?.requiresAuth === true;
    },
  },
  created() {
    void useLayoutStore().ensureLoaded();
    void useSnapSettingsStore().ensureLoaded();
  },
});
</script>

<style scoped>
ion-split-pane {
  --side-width: var(--menu-width);
  --side-min-width: var(--menu-width);
  --side-max-width: var(--menu-width);
}

ion-split-pane.menu-rail {
  --side-width: var(--menu-rail-width);
  --side-min-width: var(--menu-rail-width);
  --side-max-width: var(--menu-rail-width);
}
</style>
