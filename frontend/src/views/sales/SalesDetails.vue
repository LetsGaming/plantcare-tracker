<template>
  <ion-page>
    <details-header title="Sales Details" back-button />
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
              -{{ discountPercentage }}
            </ion-badge>

            <ion-card-header>
              <ion-card-title class="sale-title">
                {{ sale.nameFull }}
              </ion-card-title>

              <ion-card-subtitle class="sale-seller">
                Sold by <span class="seller-name">{{ sale.seller }}</span>
              </ion-card-subtitle>
            </ion-card-header>

            <ion-card-content>
              <div class="price-row">
                <span v-if="sale.oldPrice" class="old-price">
                  {{ sale.oldPrice.toFixed(2) }} €
                </span>

                <span class="current-price">
                  {{ sale.price.toFixed(2) }} €
                </span>

                <div>
                  <span v-if="savings" class="savings">
                    You save: {{ savings }} €
                  </span>
                </div>
              </div>

              <ion-button
                expand="block"
                fill="solid"
                color="primary"
                :href="sale.link"
                target="_blank"
                rel="noopener"
              >
                View Sale
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
  IonBadge,
} from "@ionic/vue";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";

import SalesService from "@/services/SalesServices";

export default defineComponent({
  name: "SalesDetails",
  components: {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonBadge,
    DetailsHeader,
    DetailsBanner,
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
    };
  },

  mounted() {
    // Fetch sale details using the provided id
    this.fetchSaleDetails();
  },
  computed: {
    saleSubtitle(): string {
      if (!this.sale) return "";

      const parts: string[] = [];

      // Seller
      if (this.sale.seller) {
        parts.push(this.sale.seller);
      }

      // Prices

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
        return Math.round(discount) + "%";
      }
      return null;
    },
  },
  methods: {
    async fetchSaleDetails() {
      try {
        this.sale = await SalesService.getSaleById(this.id);
      } catch (error) {
        console.error("Error fetching sale details:", error);
      }
    },
  },
});
</script>

<style scoped>
.sale-card {
  margin: 16px;
  position: relative;
}

.sale-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  font-weight: bold;
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 12px;
  z-index: 10;
}

.sale-title {
  font-size: 1.2rem;
  font-weight: 600;
}

.sale-seller {
  font-size: 0.9rem;
  opacity: 0.7;
}

.seller-name {
  font-weight: bold;
  opacity: 1;
}

.price-row {
  align-items: baseline;
  gap: 12px;
  margin: 12px 0 20px;
}

.current-price {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--ion-color-primary);
}

.old-price {
  margin-right: 8px;
  font-size: 1rem;
  text-decoration: line-through;
  opacity: 0.6;
  color: var(--ion-color-danger);
}
</style>
