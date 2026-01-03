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
    };
  },
  setup() {
    return {
      pricetag,
    };
  },
  computed: {
    mappedSales(): Array<{ id: number; name: string; imageUrl?: string; description?: string }> {
      return this.sales.map((sale: any, index: number) => ({
        id: sale.id,
        name: sale.name,
        imageUrl: sale.imageUrl,
        description: `${sale.seller ?? ""}${sale.price ? " - " + sale.price + "€" : ""}`,
      }));
    },
  },
  async  mounted() {
    await this.fetchSales();
  },
  methods: {
    async fetchSales() {
      this.allSales = await SalesService.getSalesData();
      this.sales = this.allSales;
    },
    async refreshSales() {
      this.allSales = await SalesService.getSalesData(true);
      this.sales = this.allSales;
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
      console.log("Navigating to sale with ID:", id);
      // Open in new tab
      const entry = this.sales.find((sale: any) => sale.id === id);
      if (entry && entry.link) {
        window.open(entry.link, "_blank");
      }
    },
  },
});
</script>
