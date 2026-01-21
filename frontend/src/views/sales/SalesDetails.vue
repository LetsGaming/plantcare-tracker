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
        <section class="sale-info align-middle">
          <ion-card class="sale-card">
            <ion-badge
              v-if="discountPercentage"
              color="danger"
              class="sale-badge"
            >
              {{ discountPercentage }}
            </ion-badge>

            <ion-card-header>
              <ion-card-title class="sale-title">
                {{ sale.nameFull }}
              </ion-card-title>

              <div class="seller-info">
                <ion-icon :icon="storefrontOutline" color="medium" />
                <ion-card-subtitle class="sale-seller">
                  {{ t("sales.sold_by") }}
                  <span class="seller-name">{{ sale.seller }}</span>
                </ion-card-subtitle>
              </div>
            </ion-card-header>

            <ion-card-content>
              <div class="price-section">
                <div class="price-row">
                  <span class="current-price">
                    {{ sale.price.toFixed(2) }} €
                  </span>
                  <span v-if="sale.oldPrice" class="old-price">
                    {{ sale.oldPrice.toFixed(2) }} €
                  </span>
                </div>

                <div v-if="savings" class="savings-container">
                  <span class="savings-label">
                    {{ t("sales.you_save") }}
                  </span>
                  <span class="savings-amount">{{ savings }} €</span>
                </div>
              </div>

              <template v-if="priceHistory.length">
                <separator-line />
                <div class="chart-wrapper">
                  <p class="chart-header">{{ t("sales.price_history") }}</p>
                  <PriceHistoryChart :history="priceHistory" />
                </div>
              </template>

              <ion-button
                expand="block"
                fill="solid"
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
import SeparatorLine from "@/components/SeperatorLine.vue";
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
    SeparatorLine,
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
      sale: null as null | Sale,
      priceHistory: [] as { price: number; timestamp: number }[],
    };
  },
  setup() {
    return {
      storefrontOutline,
    };
  },
  mounted() {
    this.fetchSaleDetails();
    this.fetchPriceHistory();
  },

  computed: {
    saleSubtitle(): string {
      if (!this.sale) return "";
      const parts: string[] = [];
      if (this.sale.seller) parts.push(this.sale.seller);
      parts.push(`${this.sale.price.toFixed(2)}€`);
      return parts.join(" · ");
    },
    savings(): string | null {
      if (this.sale && this.sale.oldPrice) {
        const savings = this.sale.oldPrice - this.sale.price;
        return savings > 0 ? savings.toFixed(2) : null;
      }
      return null;
    },
    discountPercentage(): string | null {
      if (
        this.sale &&
        this.sale.oldPrice &&
        this.sale.oldPrice > this.sale.price
      ) {
        const discount =
          ((this.sale.oldPrice - this.sale.price) / this.sale.oldPrice) * 100;
        return `-${Math.round(discount)}%`;
      }
      return null;
    },
  },

  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async fetchSaleDetails() {
      try {
        this.sale = await SalesService.getSaleById(this.id);
      } catch (error) {
        console.error("Error fetching sale details:", error);
      }
    },
    async fetchPriceHistory() {
      try {
        this.priceHistory = await SalesService.getPriceHistory(this.id);
      } catch (error) {
        console.error("Error fetching price history:", error);
      }
    },
  },
});
</script>

<style scoped>
.sale-card {
  margin: 16px;
  position: relative;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}

.sale-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  padding: 8px;
  font-size: 0.85rem;
  font-weight: 800;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(var(--ion-color-danger-rgb), 0.3);
}

.sale-title {
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.3;
  color: var(--ion-color-step-900);
}

.seller-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.sale-seller {
  margin-top: 4px;
  font-size: 0.9rem;
  color: var(--ion-color-step-600);
}

.seller-name {
  font-weight: 600;
  color: var(--ion-color-primary);
}

.price-section {
  margin: 16px 0;
}

.price-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.current-price {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--ion-color-step-900);
}

.old-price {
  font-size: 1.1rem;
  text-decoration: line-through;
  color: var(--ion-color-step-400);
}

.savings-container {
  display: flex;
  gap: 4px;
  margin-top: 4px;
  font-size: 0.9rem;
}

.savings-label {
  color: var(--ion-color-step-600);
}

.savings-amount {
  color: var(--ion-color-success);
  font-weight: 700;
}

.chart-header {
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ion-color-step-500);
}

.view-button {
  margin-top: 16px;
  height: 48px;
  font-weight: 700;
  --border-radius: 8px;
}
</style>
