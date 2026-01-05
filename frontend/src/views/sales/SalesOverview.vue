<template>
  <ion-page>
    <OverviewHeader
      title="Sales"
      :segments="[{ value: 'all', label: 'Alle', icon: pricetag }]"
      starting-segment="all"
      :on-segment-change="onSegmentChange"
      @search="handleSearch"
    />

    <ion-content>
      <ItemsOverview
        :items="mappedSales"
        item-type="sale"
        :empty-message="'Keine Verkäufe gefunden.'"
        :onItemClick="onItemClick"
        :onRefreshItems="refreshSales"
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
      id: number;
      name: string;
      imageUrl?: string;
      description?: string;
    }> {
      return this.sales.map((sale: any) => ({
        id: sale.id,
        name: sale.name,
        imageUrl: sale.imageUrl,
        description: `${sale.seller ?? ""}${
          sale.price ? " - " + sale.price + "€" : ""
        }`,
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
    async initSales() {
      this.loading = true;
      try {
        // Stream new sales as they arrive
        this.stopStream = SalesService.streamSales((chunk) => {
          chunk.forEach((sale) => {
            if (!this.sales.find((s) => s.id === sale.id)) {
              this.sales.push(sale);
            }
          });
          this.allSales = this.sales;
        });

        // Also wait for the final cached result
        const all = await SalesService.getSales(true);
        this.allSales = all;
        this.sales = all;
      } catch (err) {
        console.error("Error fetching sales:", err);
      } finally {
        this.loading = false;
      }
    },

    async fetchSales() {
      // for explicit fetch without streaming
      this.loading = true;
      try {
        const all = await SalesService.getSales();
        this.allSales = all;
        this.sales = all;
      } catch (err) {
        console.error("Error fetching sales:", err);
      } finally {
        this.loading = false;
      }
    },

    async refreshSales() {
      // stop current stream if active
      this.stopStream?.();
      this.sales = [];
      this.allSales = [];
      await this.initSales();
    },

    handleSearch(query: string) {
      const lowerQuery = query.toLowerCase();
      this.sales = this.allSales.filter((sale: any) =>
        sale.name.toLowerCase().includes(lowerQuery)
      );
    },

    onSegmentChange(value: string) {
      // handle segment changes if needed (no-op for now)
    },

    onItemClick(id: string) {
      this.$router.push({ name: "sales-details", params: { id } });
    },
  },
});
</script>
