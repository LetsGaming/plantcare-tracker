<template>
  <ion-page>
    <details-header :show-edit-button="false" default-back-href="/sales" />

    <ion-content>
      <div v-if="sale">
        <details-banner
          :banner-title="sale.name"
          :banner-subtitle="saleSubtitle"
          :image-url="sale.imageUrl"
        />

        <section class="sale-info">
          <!-- PRIMARY CARD: minimal info + CTA -->
          <ion-card class="sale-card align-middle">
            <ion-badge
              v-if="discountPercentage"
              color="danger"
              class="sale-badge round-badge"
            >
              {{ discountPercentage }}
            </ion-badge>

            <ion-card-header>
              <ion-card-title class="sale-title">
                {{ sale.nameFull }}
              </ion-card-title>

              <div class="seller-info">
                <ion-icon
                  :icon="storefrontOutline"
                  color="medium"
                  style="cursor: unset"
                />
                <ion-card-subtitle class="sale-seller">
                  {{ t("sales.sold_by") }}
                  <span class="seller-name">{{ sale.seller }}</span>
                </ion-card-subtitle>
              </div>
            </ion-card-header>

            <ion-card-content>
              <!-- Minimal price info -->
              <div class="price-section">
                <div class="price-row">
                  <span class="current-price">
                    {{ sale.price.toFixed(2) }} €
                  </span>

                  <span v-if="sale.oldPrice" class="old-price">
                    {{ sale.oldPrice.toFixed(2) }} €
                  </span>
                </div>

                <div
                  v-if="discountPercentage && savings"
                  class="savings-container"
                >
                  <span class="savings-amount">
                    {{ discountPercentage }} · {{ savings }} € {{ t("sales.savings") }}
                  </span>
                </div>
              </div>

              <!-- PRIMARY CTA -->
              <ion-button
                expand="block"
                color="primary"
                class="view-button"
                :href="sale.link"
                target="_blank"
                rel="noopener"
              >
                {{ t("sales.view_sale") }}
              </ion-button>
            </ion-card-content>
          </ion-card>

          <!-- SECONDARY CARD: optional deep info -->
          <ion-card
            v-if="priceHistory.length"
            class="sale-card align-middle secondary-card"
          >
            <ion-card-header>
              <ion-card-title class="chart-header">
                {{ t("sales.price_history") }}
              </ion-card-title>
            </ion-card-header>

            <ion-card-content>
              <!-- 1 point -->
              <div v-if="priceHistory.length === 1" class="history-fallback">
                <p class="history-meta">
                  {{ t("sales.first_tracked_price") }}
                </p>
              </div>

              <!-- 2 points -->
              <div
                v-else-if="priceHistory.length === 2"
                class="history-fallback"
              >
                <p class="history-meta">
                  {{ priceTrendLabel }}
                </p>
              </div>

              <!-- 3+ points -->
              <div v-else class="chart-wrapper">
                <PriceHistoryChart
                  :history="priceHistory"
                  :reference-price="sale.oldPrice"
                />
              </div>
            </ion-card-content>
          </ion-card>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonCardTitle,
  IonCardSubtitle,
  IonButton,
  IonBadge,
  IonIcon,
} from "@ionic/vue";
import { storefrontOutline } from "ionicons/icons";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import PriceHistoryChart from "@/components/sales/PriceHistoryChart.vue";

import SalesService from "@/services/SalesServices";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SalesDetails",
  components: {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonCardTitle,
    IonCardSubtitle,
    IonButton,
    IonBadge,
    IonIcon,
    DetailsHeader,
    DetailsBanner,
    PriceHistoryChart,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
  },
  data() {
    return {
      sale: null as Sale | null,
      priceHistory: [] as { price: number; timestamp: number }[],
    };
  },
  setup() {
    return { storefrontOutline };
  },
  mounted() {
    this.fetchSaleDetails();
    this.fetchPriceHistory();
  },
  computed: {
    saleSubtitle(): string {
      if (!this.sale) return "";
      return `${this.sale.seller} · ${this.sale.price.toFixed(2)} €`;
    },
    savings(): string | null {
      if (!this.sale?.oldPrice) return null;
      const diff = this.sale.oldPrice - this.sale.price;
      return diff > 0 ? diff.toFixed(2) : null;
    },
    discountPercentage(): string | null {
      if (!this.sale?.oldPrice || this.sale.oldPrice <= this.sale.price) {
        return null;
      }
      const pct =
        ((this.sale.oldPrice - this.sale.price) / this.sale.oldPrice) * 100;
      return `-${Math.round(pct)}%`;
    },
    priceTrendLabel(): string {
      if (!this.priceHistory || this.priceHistory.length === 0) return "";

      // Sort by timestamp ascending
      const sorted = [...this.priceHistory].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      const [first, last] = sorted;

      const diff = last.price - first.price; // positive if increased
      const diffAbs = Math.abs(diff);
      const diffPct = ((diff / first.price) * 100).toFixed(2);

      if (diff < 0) {
        return `${this.t("sales.price_dropped")} -€${diffAbs.toFixed(2)} (${diffPct}%)`;
      }
      if (diff > 0) {
        return `${this.t("sales.price_increased")} +€${diffAbs.toFixed(2)} (${diffPct}%)`;
      }
      return `${this.t("sales.price_unchanged")} €0.00 (0.00%)`;
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    async fetchSaleDetails() {
      this.sale = await SalesService.getSaleById(this.id);
    },
    async fetchPriceHistory() {
      this.priceHistory = await SalesService.getPriceHistory(this.id);
    },
  },
});
</script>

<style scoped>
.sale-card {
  display: block;
  border-radius: 12px;
}

.secondary-card {
  opacity: 0.95;
}

.sale-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  font-weight: 800;
}

.sale-title {
  max-width: 90%;
  font-size: 1.25rem;
  font-weight: 700;
}

.seller-info {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.sale-seller {
  font-size: 0.9rem;
  color: var(--ion-color-step-600);
}

.seller-name {
  font-weight: 600;
  color: var(--ion-color-primary);
}

.price-section {
  margin: 12px 0 16px;
}

.price-row {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.current-price {
  font-size: 1.75rem;
  font-weight: 800;
}

.old-price {
  text-decoration: line-through;
  color: var(--ion-color-step-400);
}

.savings-amount {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--ion-color-success);
}

.chart-header {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--ion-color-step-500);
}

.history-fallback {
  padding: 8px 0;
}

.history-meta {
  font-size: 0.95rem;
  color: var(--ion-color-step-700);
}

.view-button {
  font-weight: 700;
}
</style>
