<template>
  <ion-page>
    <details-header :show-edit-button="false" default-back-href="/tabs/sales" />
    <ion-content>
      <pull-refresher :handler="refresh" />

      <div v-if="sale" class="detail-column">
        <detail-hero
          :title="sale.nameFull || sale.name"
          :image-url="sale.imageUrl"
          :image-alt="t('saledetail.image_alt', { name: sale.name })"
          kind="sale"
          :seed="String(sale.id)"
        >
          <span>{{ t("saledetail.seller", { seller: sale.seller }) }}</span>
        </detail-hero>

        <div class="detail-body">
          <section class="price-block" aria-labelledby="sale-price">
            <h2 id="sale-price" class="section-title">{{ t("saledetail.current_price") }}</h2>
            <p class="price-row">
              <strong class="current-price">{{ formatPrice(sale.price) }}</strong>
              <del v-if="hasDiscount" class="old-price">
                <span class="sr-only">{{ t("saledetail.old_price") }}</span>
                {{ formatPrice(sale.oldPrice ?? 0) }}
              </del>
            </p>
            <p v-if="hasDiscount" class="saving">
              {{
                t("saledetail.saving", {
                  amount: formatPrice(savingAmount),
                  percent: savingPercent,
                })
              }}
            </p>
            <ion-button
              class="shop-button"
              expand="block"
              :href="sale.link"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="
                t('saledetail.open_shop_label', { name: sale.name, seller: sale.seller })
              "
            >
              {{ t("saledetail.open_shop") }}
              <ion-icon slot="end" :icon="openOutline" aria-hidden="true" />
            </ion-button>
          </section>

          <section v-if="detail" class="history" aria-labelledby="sale-history">
            <h2 id="sale-history" class="section-title">{{ t("sales.price_history") }}</h2>
            <p v-if="priceHistory.length < 2" class="history-hint">
              {{ t("sales3.history_hint") }}
            </p>
            <p v-else-if="priceHistory.length === 2" class="text-soft">
              {{ priceTrendLabel }}
            </p>
            <PriceHistoryChart
              v-else
              :history="priceHistory"
              :reference-price="sale.oldPrice ?? undefined"
              :caption="t('saledetail.history_caption', { name: sale.name })"
            />
          </section>
        </div>
      </div>

      <state-block
        v-else-if="phase === 'loading'"
        kind="loading"
        :title="t('saledetail.loading')"
        :skeletons="2"
      />
      <state-block
        v-else-if="phase === 'not-found'"
        kind="not-found"
        placeholder-kind="sale"
        :title="t('state.not_found_title')"
        :message="t('state.not_found_message')"
        :action-label="t('state.back_to_list')"
        @action="goToList"
      />
      <state-block
        v-else
        kind="error"
        placeholder-kind="sale"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="retry()"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonButton, IonIcon } from "@ionic/vue";
import { openOutline } from "ionicons/icons";
import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailHero from "@/components/ui/DetailHero.vue";
import PullRefresher from "@/components/ui/PullRefresher.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import PriceHistoryChart from "@/components/sales/PriceHistoryChart.vue";
import { mapActions, mapState } from "pinia";
import { useSalesStore } from "@/stores/sales";
import localizationService from "@/services/general/LocalizationService";
import { LoadPhase, phaseFromError } from "@/utils/loadPhase";
import { formatPrice } from "@/utils/formatPrice";
import { numberFormat } from "@/utils/intlCache";

export default defineComponent({
  name: "SalesDetails",
  components: {
    IonPage,
    IonContent,
    IonButton,
    IonIcon,
    DetailsHeader,
    DetailHero,
    PullRefresher,
    StateBlock,
    PriceHistoryChart,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { openOutline };
  },
  data() {
    return {
      phase: "loading" as LoadPhase,
      entering: null as Promise<void> | null,
      shown: false,
      detail: null as { sale: Sale; history: readonly SalePricePoint[] } | null,
    };
  },
  watch: {
    id() {
      this.detail = null;
    },
  },
  async ionViewWillEnter() {
    this.entering = this.reload();
    await this.entering;
  },
  async ionViewDidEnter() {
    this.shown = true;
    await this.entering;
    // Only once the transition is over: marking it seen re-sorts the list page still mounted below.
    this.markShownSeen();
  },
  ionViewWillLeave() {
    this.shown = false;
  },
  beforeUnmount() {
    this.shown = false;
  },
  computed: {
    ...mapState(useSalesStore, ["byId"]),
    sale(): Sale | null {
      return this.detail?.sale ?? this.byId(this.id) ?? null;
    },
    priceHistory(): readonly SalePricePoint[] {
      return this.detail?.history ?? [];
    },
    hasDiscount(): boolean {
      return !!this.sale?.oldPrice && this.sale.oldPrice > this.sale.price;
    },
    savingAmount(): number {
      return this.sale?.oldPrice ? this.sale.oldPrice - this.sale.price : 0;
    },
    savingPercent(): string {
      if (!this.sale || !this.hasDiscount) return "";
      return numberFormat(localizationService.getLocale(), {
        style: "percent",
        maximumFractionDigits: 0,
      }).format(this.savingAmount / (this.sale.oldPrice ?? 1));
    },
    priceTrendLabel(): string {
      if (!this.priceHistory || this.priceHistory.length === 0) return "";
      const sorted = [...this.priceHistory].sort((a, b) => a.observedAt - b.observedAt);
      const [first, last] = sorted;
      const diff = last.price - first.price;
      const diffAbs = this.formatPrice(Math.abs(diff));
      const diffPct = ((diff / first.price) * 100).toFixed(2);
      if (diff < 0) {
        return `${this.t("sales.price_dropped")} -${diffAbs} (${diffPct}%)`;
      }
      if (diff > 0) {
        return `${this.t("sales.price_increased")} +${diffAbs} (${diffPct}%)`;
      }
      return `${this.t("sales.price_unchanged")} ${diffAbs} (0.00%)`;
    },
  },
  methods: {
    ...mapActions(useSalesStore, {
      restore: "restore",
      loadDetail: "loadDetail",
      markSeen: "markSeen",
    }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    formatPrice,
    async reload() {
      const id = this.id;
      if (!this.sale) this.phase = "loading";
      await this.restore().catch(() => undefined);
      if (this.sale) this.phase = "ready";
      try {
        const loaded = await this.loadDetail(id);
        if (loaded && id === this.id) this.detail = loaded;
      } catch (error) {
        if (!this.sale) {
          this.phase = phaseFromError(error);
          return;
        }
      }
      this.phase = this.sale ? "ready" : "not-found";
    },
    markShownSeen() {
      if (this.shown && this.sale) this.markSeen(this.id, this.sale.firstSeenAt);
    },
    async retry() {
      await this.reload();
      this.markShownSeen();
    },
    refresh() {
      return this.retry();
    },
    goToList() {
      this.$router.replace({ name: "sales" });
    },
  },
});
</script>

<style scoped>
.detail-column {
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding-bottom: var(--space-6);
}

.detail-body {
  padding: var(--space-5) var(--space-4) 0;
  display: grid;
  gap: var(--space-5);
  align-items: start;
}

.section-title {
  margin: 0 0 var(--space-3);
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.price-row {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-3);
}

.current-price {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.1;
}

.old-price {
  color: var(--ink-soft);
  font-size: var(--text-md);
}

.saving {
  margin: var(--space-2) 0 var(--space-4);
  font-weight: 700;
  color: var(--ion-text-color);
}

.shop-button {
  margin: var(--space-4) 0 0;
  min-height: var(--tap-min);
}

.history-hint {
  margin: 0;
  padding: var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-sunken);
  color: var(--ink-soft);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (min-width: 900px) {
  .detail-body {
    grid-template-columns: minmax(280px, 1fr) 1.4fr;
  }
}
</style>
