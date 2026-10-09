<template>
  <ion-page>
    <ion-tabs>
      <ion-router-outlet name="tabs"></ion-router-outlet>

      <ion-tab-bar slot="bottom" id="nav-tab-bar">
        <ion-tab-button tab="plants" href="/tabs/plants">
          <ion-icon :icon="tabIcon('plants')" aria-hidden="true" />
          <ion-label>{{ t("tabs.plants") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="water" href="/tabs/water">
          <ion-icon :icon="tabIcon('water')" aria-hidden="true" />
          <ion-label>{{ t("tabs.water") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="substrates" href="/tabs/substrates">
          <ion-icon :icon="tabIcon('substrates')" aria-hidden="true" />
          <ion-label>{{ t("tabs.substrates") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="components" href="/tabs/components">
          <ion-icon :icon="tabIcon('components')" aria-hidden="true" />
          <ion-label>{{ t("tabs.components") }}</ion-label>
        </ion-tab-button>

        <ion-tab-button tab="sales" href="/tabs/sales">
          <ion-icon :icon="tabIcon('sales')" aria-hidden="true" />
          <ion-label>{{ t("tabs.sales") }}</ion-label>
          <ion-badge
            v-if="salesCount > 0"
            color="secondary"
            :aria-label="t('tabs.sales_new', { count: salesCount })"
          >
            {{ salesCount }}
          </ion-badge>
        </ion-tab-button>

        <ion-tab-button tab="debug" href="/tabs/debug" v-if="isDev">
          <ion-icon :icon="tabIcon('debug')" aria-hidden="true" />
          <ion-label>{{ t("tabs.debug") }}</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
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
  IonBadge,
} from "@ionic/vue";
import { navIcons, type NavDestination } from "@/theme/icons";
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
    IonBadge,
  },
  setup() {
    return {
      isDev: import.meta.env.MODE === "development",
    };
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    activeTab(): string {
      return /^\/tabs\/([^/]+)/.exec(this.$route?.path ?? "")?.[1] ?? "";
    },
    ...mapState(useSalesStore, { salesCount: "newCount" }),
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
    tabIcon(tab: NavDestination): string {
      return this.activeTab === tab ? navIcons[tab].selected : navIcons[tab].idle;
    },
    ...mapActions(useSalesStore, { restoreSales: "restore" }),
    ...mapActions(useAdminHealthStore, { loadSourceHealth: "load" }),
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
  },
});
</script>

<style scoped>
ion-tab-bar {
  padding-bottom: env(safe-area-inset-bottom);
}

@media (min-width: 992px) {
  ion-tab-bar {
    display: none;
  }
}

ion-badge {
  --padding-start: 6px;
  --padding-end: 6px;
  font-weight: 700;
}
</style>
