<template>
  <ion-page>
    <overview-header :title="t('sales.title')" :show-add-button="false" />

    <items-overview
      :items="mappedSales"
      kind="sale"
      :is-loading="isLoadingList"
      :has-error="failed"
      :empty-title="t('state.empty_sales_title')"
      :empty-message="t('state.empty_sales_message')"
      @item-click="onItemClick"
      @refresh-items="fetchSales"
      @retry="fetchSales"
    >
      <template #count-actions="{ newInView }">
        <span v-if="streaming" class="checking" role="status">
          <ion-spinner name="dots" aria-hidden="true" />
          {{ t("sales2.checking") }}
        </span>
        <ion-button v-else-if="newInView > 0" fill="clear" class="mark-all" @click="markAllSeen">
          {{ t("sales2.mark_all_seen") }}
        </ion-button>
      </template>
    </items-overview>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonButton, IonSpinner } from "@ionic/vue";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import localizationService from "@/services/general/LocalizationService";
import { discountPercent, formatDiscount, formatPrice } from "@/utils/formatPrice";

import { mapActions, mapState } from "pinia";
import { useSalesStore } from "@/stores/sales";

export default defineComponent({
  name: "SalesOverview",
  components: {
    IonPage,
    IonButton,
    IonSpinner,
    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      failed: false,
      loadedOnce: false,
      openedId: null as string | null,
    };
  },
  computed: {
    ...mapState(useSalesStore, {
      sales: "visibleSales",
      streaming: "streaming",
    }),
    isLoadingList(): boolean {
      return this.streaming || !this.loadedOnce;
    },
    mappedSales(): OverviewItem[] {
      return this.sales.map((sale: Sale) => ({
        id: sale.id,
        name: sale.name,
        imageUrl: sale.imageUrl,
        description: sale.seller,
        isNew: sale.isNew,
        priceText: sale.price ? formatPrice(sale.price) : undefined,
        oldPriceText: discountPercent(sale.price, sale.oldPrice)
          ? formatPrice(sale.oldPrice)
          : undefined,
        discountText: formatDiscount(sale.price, sale.oldPrice) || undefined,
      }));
    },
  },
  mounted() {
    void this.fetchSales(false);
  },
  ionViewWillEnter() {
    if (this.openedId === null) return;
    this.markSeen(this.openedId);
    this.openedId = null;
  },
  methods: {
    ...mapActions(useSalesStore, {
      loadSales: "load",
      markSeen: "markSeen",
      markAllSeen: "markAllSeen",
    }),
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async fetchSales(force = true) {
      this.failed = false;
      try {
        await this.loadSales({ force: force === true });
      } catch (err) {
        // handleRequest has already shown the error toast.
        this.failed = true;
        console.error("Error fetching sales:", err);
      } finally {
        this.loadedOnce = true;
      }
    },

    async onItemClick(id: string) {
      if (!this.sales.find((s: Sale) => s.id === id)) return;

      this.openedId = id;
      await this.$router.push({ name: "sales-details", params: { id } });
    },
  },
});
</script>

<style scoped>
.mark-all {
  margin: 0;
  min-height: var(--tap-min);
}

.checking {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.checking ion-spinner {
  width: 24px;
  height: 24px;
}
</style>
