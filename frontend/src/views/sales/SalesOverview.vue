<template>
  <ion-page>
    <OverviewHeader
      :title="t('sales.title')"
      :segments="[{ value: 'all', label: t('segment.all'), icon: pricetag }]"
      starting-segment="all"
      :on-segment-change="onSegmentChange"
      @search="handleSearch"
      :show-add-button="false"
    />

    <ion-content>
      <ItemsOverview
        :items="mappedSales"
        item-type="sale"
        :empty-message="t('sales.empty')"
        :onItemClick="onItemClick"
        :onRefreshItems="fetchSales"
      >
      </ItemsOverview>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import { pricetag } from "ionicons/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import localizationService from '@/services/general/LocalizationService'

import SalesService from "@/services/SalesServices";

export default defineComponent({
  name: "SalesOverview",
  components: {
    IonPage,
    IonContent,
    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      sales: [] as Sale[],
      allSales: [] as Sale[],
      stopStream: null as null | (() => void),
      loading: true,
    };
  },
  setup() {
    return { pricetag };
  },
  computed: {
    mappedSales(): Array<{
      id: string;
      name: string;
      imageUrl?: string;
      description?: string;
      isNew?: boolean;
    }> {
      return this.sales.map((sale: Sale) => ({
        id: sale.id,
        name: sale.name,
        imageUrl: sale.imageUrl,
        description: `${sale.seller ?? ""}${
          sale.price ? " - " + sale.price + "€" : ""
        }`,
        isNew: sale.isNew,
      }));
    },
  },
  mounted() {
    this.initSales();
  },
  beforeUnmount() {
    // stop the SSE stream when leaving the page
    this.stopStream?.();
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async initSales() {
      this.loading = true;
      try {
        const all = await SalesService.getSales({
          onUpdate: (chunk: Sale[]) => {
            chunk.forEach((sale) => {
              if (!this.sales.find((s) => s.id === sale.id)) {
                this.sales.push(sale);
              }
            });
            this.allSales = this.sales;
          },
        });

        // initial / final resolved result
        this.sales = all;
        this.allSales = all;
      } catch (err) {
        console.error("Error fetching sales:", err);
      } finally {
        this.loading = false;
      }
    },

    async fetchSales() {
      // explicit fetch without streaming
      this.loading = true;
      try {
        const all = await SalesService.getSales({ forceUpdate: true });
        this.sales = all;
        this.allSales = all;
      } catch (err) {
        console.error("Error fetching sales:", err);
      } finally {
        this.loading = false;
      }
    },

    handleSearch(query: string) {
      const lowerQuery = query.toLowerCase();
      this.sales = this.allSales.filter((sale: Sale) =>
        sale.name.toLowerCase().includes(lowerQuery)
      );
    },

    onSegmentChange(value: string) {
      // no-op
    },

    onItemClick(id: string ) {
      this.$router.push({ name: "sales-details", params: { id } });
    },
  },
});
</script>
