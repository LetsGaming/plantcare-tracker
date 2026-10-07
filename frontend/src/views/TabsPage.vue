<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet name="tabs"></ion-router-outlet>

      <ion-tab-bar slot="bottom" id="nav-tab-bar">
        <ion-tab-button tab="tab1" href="/tabs/plants">
          <ion-icon :icon="leaf" />
          <ion-label>{{ t("tabs.plants") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab2" href="/tabs/substrates">
          <ion-icon :icon="cube" />
          <ion-label>{{ t("tabs.substrates") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab3" href="/tabs/components">
          <ion-icon :icon="grid" />
          <ion-label>{{ t("tabs.components") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="tab4" href="/tabs/debug" v-if="isDev">
          <ion-icon :icon="bug" />
          <ion-label>{{ t("tabs.debug") }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button router-link="/sales">
        <ion-icon :icon="pricetag" />
      </ion-fab-button>
      <ion-badge v-if="salesCount > 0" color="danger" class="sales-amount-badge">
        {{ salesCount }}
      </ion-badge>
      <ion-badge
        v-if="failingSources > 0"
        color="warning"
        class="sources-warning-badge"
        role="status"
        :aria-label="t('admin.scrapers.failing_badge', { count: failingSources })"
        :title="t('admin.scrapers.failing_badge', { count: failingSources })"
      >
        <ion-icon :icon="warning" />
        {{ failingSources }}
      </ion-badge>
    </ion-fab>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapActions, mapState } from "pinia";
import {
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonLabel,
  IonIcon,
  IonPage,
  IonRouterOutlet,
  IonFab,
  IonFabButton,
  IonBadge,
} from "@ionic/vue";
import { cube, grid, leaf, pricetag, bug, warning } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";
import { useSessionStore } from "@/stores/session";
import { useSalesStore } from "@/stores/sales";
import { useAdminHealthStore } from "@/stores/adminHealth";

export default defineComponent({
  name: "TabsPage",
  components: {
    IonTabBar,
    IonTabButton,
    IonTabs,
    IonLabel,
    IonIcon,
    IonPage,
    IonRouterOutlet,
    IonFab,
    IonFabButton,
    IonBadge,
  },
  setup() {
    return {
      cube,
      grid,
      leaf,
      pricetag,
      bug,
      warning,
      isDev: import.meta.env.MODE === "development",
    };
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useSalesStore, { salesCount: "newCount" }),
    ...mapState(useAdminHealthStore, { failingSources: "needingAttention" }),
  },
  async mounted() {
    await this.restoreSales();
    if (!this.isAdmin) return;
    try {
      await this.loadSourceHealth();
    } catch (error) {
      console.error("Loading source health failed:", error);
    }
  },
  methods: {
    ...mapActions(useSalesStore, { restoreSales: "restore" }),
    ...mapActions(useAdminHealthStore, { loadSourceHealth: "load" }),
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
  },
});
</script>

<style scoped>
.sales-amount-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  font-size: 0.75rem;
  height: 28px;
  min-width: 28px;
  padding: 0 4px;
  line-height: 18px;
  border-radius: 50%;
  justify-content: center;
  display: flex;
  align-items: center;
  pointer-events: none; /* Prevents badge from blocking fab-button clicks */
}

.sources-warning-badge {
  position: absolute;
  top: -5px;
  left: -5px;
  font-size: 0.75rem;
  height: 28px;
  min-width: 28px;
  padding: 0 6px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

@media (max-width: 768px) {
  ion-fab {
    margin-bottom: 70px; /* Offset for the bottom tab bar on mobile */
  }
}
</style>
