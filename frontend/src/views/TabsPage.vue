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
      </ion-tab-bar>
    </ion-tabs>

    <ion-fab vertical="bottom" horizontal="end" slot="fixed">
      <ion-fab-button router-link="/sales">
        <ion-icon :icon="pricetag" />
      </ion-fab-button>
      <ion-badge
        v-if="salesCount > 0"
        color="danger"
        class="sales-amount-badge"
      >
        {{ salesCount }}
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
import { cube, grid, leaf, pricetag } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";
import SalesService, { SaleEvents } from "@/services/SalesServices";

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

onMounted(() => {
  loadNewSalesCount();

  // Listen for the event name defined in SalesService
  document.addEventListener(SaleEvents.SALE_SEEN, handleSaleSeenEvent);
});

onUnmounted(() => {
  // Clean up standard DOM listener
  document.removeEventListener(SaleEvents.SALE_SEEN, handleSaleSeenEvent);
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

@media (max-width: 768px) {
  ion-fab {
    margin-bottom: 70px; /* Offset for the bottom tab bar on mobile */
  }
}
</style>
