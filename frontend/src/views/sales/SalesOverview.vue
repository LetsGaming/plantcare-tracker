<template>
  <ion-page>
    <overview-header :title="t('sales.title')" :show-add-button="false" />

    <items-overview
      :items="mappedSales"
      kind="sale"
      :is-loading="isLoadingList"
      :has-error="failed"
      presorted
      :active="pageActive"
      :list-key="listKey"
      :empty-title="filtersHideAll ? t('sales.filter.none_title') : t('state.empty_sales_title')"
      :empty-message="
        filtersHideAll ? t('sales.filter.none_message') : t('state.empty_sales_message')
      "
      :empty-action-label="filtersHideAll ? t('sales.filter.reset_action') : ''"
      @empty-action="resetQuery"
      @item-click="onItemClick"
      @refresh-items="fetchSales"
      @retry="fetchSales"
    >
      <template #filters>
        <div v-if="sales.length" class="sales-controls">
          <ion-select
            class="sort-select"
            interface="popover"
            :aria-label="t('sales.sort.label')"
            :value="query.sort"
            @ionChange="setQuery({ sort: $event.detail.value })"
          >
            <ion-icon slot="start" :icon="sortIcon" aria-hidden="true" />
            <ion-select-option v-for="sort in sorts" :key="sort" :value="sort">
              {{ t(`sales.sort.${sortKey(sort)}`) }}
            </ion-select-option>
          </ion-select>
          <ion-button
            fill="outline"
            class="filter-button"
            :aria-label="
              filterCount > 0
                ? `${t('sales.filter.button')}, ${t('sales.filter.active', { count: filterCount })}`
                : t('sales.filter.button')
            "
            @click="showFilter = true"
          >
            <ion-icon slot="start" :icon="filterIcon" aria-hidden="true" />
            {{ t("sales.filter.button") }}
            <ion-badge v-if="filterCount > 0" class="filter-badge">{{ filterCount }}</ion-badge>
          </ion-button>
        </div>
        <p v-if="updatedText" class="shown">{{ updatedText }}</p>
        <p v-if="filterCount > 0 && sales.length" class="shown" aria-live="polite">
          {{ t("sales.filter.shown", { shown: sales.length, total: allCount }) }}
        </p>
      </template>

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

    <sales-filter-modal
      :is-open="showFilter"
      :query="query"
      :sellers="sellers"
      @close="showFilter = false"
      @apply="applyFilters"
      @reset="resetFilters"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonButton,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonBadge,
} from "@ionic/vue";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview, { type OverviewItem } from "@/components/overview/ItemsOverview.vue";
import SalesFilterModal from "@/components/sales/SalesFilterModal.vue";
import { icons } from "@/theme/icons";
import {
  SALES_SORTS,
  activeFilterCount,
  type SalesQuery,
  type SalesSort,
} from "@/utils/salesQuery";
import localizationService from "@/services/general/LocalizationService";
import { discountPercent, formatDiscount, formatPrice } from "@/utils/formatPrice";
import { dateTimeFormat } from "@/utils/intlCache";
import { isActive, pageActive } from "@/utils/pageActive";

import { mapActions, mapState } from "pinia";
import { useSalesStore } from "@/stores/sales";

type CardText = Pick<OverviewItem, "priceText" | "oldPriceText" | "discountText">;

const cardText = (sale: Sale, locale: string): CardText => ({
  priceText: sale.price ? formatPrice(sale.price, locale) : undefined,
  oldPriceText:
    sale.oldPrice !== null && discountPercent(sale.price, sale.oldPrice)
      ? formatPrice(sale.oldPrice, locale)
      : undefined,
  discountText:
    sale.oldPrice !== null
      ? formatDiscount(sale.price, sale.oldPrice, locale) || undefined
      : undefined,
});

/** Card texts of the last rendered list, by id, prices and locale. */
let cardTexts = new Map<string, CardText>();
let lastCards: OverviewItem[] = [];

export default defineComponent({
  name: "SalesOverview",
  mixins: [pageActive],
  components: {
    IonPage,
    IonButton,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonBadge,
    OverviewHeader,
    ItemsOverview,
    SalesFilterModal,
  },
  data() {
    return {
      failed: false,
      loadedOnce: false,
      showFilter: false,
      sorts: SALES_SORTS,
      sortIcon: icons.sort,
      filterIcon: icons.filter,
    };
  },
  computed: {
    ...mapState(useSalesStore, {
      sales: "filteredSales",
      allSales: "items",
      sellers: "sellers",
      query: "query",
      streaming: "streaming",
      isNew: "isNew",
      byId: "byId",
      summary: "summary",
    }),
    listKey(): string {
      const { sort, shops, onlyNew, minDiscount, minPrice, maxPrice } = this.query;
      return [sort, shops.join(","), onlyNew, minDiscount, minPrice, maxPrice].join("|");
    },
    updatedText(): string {
      const at = this.summary.listRefreshedAt;
      if (at === null) return "";
      const time = dateTimeFormat(localizationService.getLocale(), {
        dateStyle: "short",
        timeStyle: "short",
      }).format(at);
      return this.t("sales.updated_at", { time });
    },
    allCount(): number {
      return this.allSales.length;
    },
    filterCount(): number {
      return activeFilterCount(this.query);
    },
    filtersHideAll(): boolean {
      return this.sales.length === 0 && this.allCount > 0 && this.filterCount > 0;
    },
    isLoadingList(): boolean {
      return this.allCount === 0 && (this.streaming || !this.loadedOnce);
    },
    mappedSales(): OverviewItem[] {
      if (!isActive(this)) return lastCards;
      const locale = localizationService.getLocale();
      const texts = new Map<string, CardText>();
      const items = this.sales.map((sale: Sale) => {
        const key = `${sale.id}|${sale.price}|${sale.oldPrice}|${locale}`;
        const text = cardTexts.get(key) ?? cardText(sale, locale);
        texts.set(key, text);
        return Object.freeze({
          id: sale.id,
          name: sale.name,
          imageUrl: sale.imageUrl,
          description: sale.seller,
          searchText: sale.searchKey,
          isNew: this.isNew(sale.id),
          ...text,
        });
      });
      cardTexts = texts;
      lastCards = items;
      return items;
    },
  },
  mounted() {
    void this.restore().catch((error: unknown) => console.error("Restoring sales failed:", error));
  },
  async ionViewDidEnter() {
    await this.fetchSales(false);
  },
  methods: {
    ...mapActions(useSalesStore, {
      restore: "restore",
      replaySales: "replay",
      ensureFresh: "ensureFresh",
      markAllSeen: "markAllSeen",
      setQuery: "setQuery",
      resetQuery: "resetQuery",
    }),
    sortKey(sort: SalesSort): string {
      return sort === "priceAsc" ? "price_asc" : sort === "priceDesc" ? "price_desc" : sort;
    },
    applyFilters(query: SalesQuery) {
      this.setQuery(query);
      this.showFilter = false;
    },
    resetFilters() {
      this.resetQuery();
      this.showFilter = false;
    },
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async fetchSales(force = true) {
      this.failed = false;
      try {
        if (force === true) await this.replaySales();
        else await this.ensureFresh();
      } catch (err) {
        // handleRequest has already shown the error toast.
        this.failed = true;
        console.error("Error fetching sales:", err);
      } finally {
        this.loadedOnce = true;
      }
    },

    async onItemClick(id: string) {
      if (!this.byId(id)) return;
      await this.$router.push({ name: "sales-details", params: { id } });
    },
  },
});
</script>

<style scoped>
.sales-controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4) var(--space-2);
}

.sort-select {
  flex: 1;
  min-height: var(--tap-min);
}

.filter-button {
  margin: 0;
  min-height: var(--tap-min);
}

.filter-badge {
  margin-inline-start: var(--space-2);
}

.shown {
  margin: 0;
  padding: 0 var(--space-4) var(--space-2);
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

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
