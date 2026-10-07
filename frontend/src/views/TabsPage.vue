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

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
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
import SalesService, { SaleEvents } from "@/services/SalesServices";
import AdminService, { AdminEvents } from "@/services/AdminService";
import UserService from "@/services/UserService";

const t = (k: string, v?: Record<string, string | number>, f?: string) =>
  localizationService.t(k, v, f);

const salesCount = ref<number>(0);

/**
 * Loads the current count of unseen sales.
 */
const loadNewSalesCount = async () => {
  salesCount.value = await SalesService.getNewSalesCount();
};

/**
 * Handle the custom event emitted by SalesService
 */
const handleSaleSeenEvent = () => {
  loadNewSalesCount();
};

const isDev = import.meta.env.MODE === "development";

/** Admin-only count of scrape sources that currently return no usable data. */
const failingSources = ref<number>(0);

const handleSourceHealthUpdated = (event: Event) => {
  failingSources.value = AdminService.countNeedingAttention(
    (event as CustomEvent<SourceHealth[]>).detail,
  );
};

const loadSourceHealth = async () => {
  if (!(await UserService.isAdmin())) return;
  try {
    // The service announces the result, which updates failingSources
    await AdminService.getSourceHealth();
  } catch (error) {
    console.error("Loading source health failed:", error);
  }
};

onMounted(() => {
  loadNewSalesCount();
  loadSourceHealth();

  // Listen for the event name defined in SalesService
  document.addEventListener(SaleEvents.SALE_SEEN, handleSaleSeenEvent);
  document.addEventListener(AdminEvents.SOURCE_HEALTH_UPDATED, handleSourceHealthUpdated);
});

onUnmounted(() => {
  // Clean up standard DOM listener
  document.removeEventListener(SaleEvents.SALE_SEEN, handleSaleSeenEvent);
  document.removeEventListener(AdminEvents.SOURCE_HEALTH_UPDATED, handleSourceHealthUpdated);
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
