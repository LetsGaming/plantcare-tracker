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
import localizationService from "@/services/general/LocalizationService";

import { mapActions, mapState } from "pinia";
import { useSalesStore } from "@/stores/sales";

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
      searchQuery: "",
      loading: true,
    };
  },
  setup() {
    return { pricetag };
  },
  computed: {
    ...mapState(useSalesStore, { allSales: "visibleSales" }),
    /** Sales matching the search; the store adds streamed sales as they arrive. */
    sales(): Sale[] {
      const query = this.searchQuery.toLowerCase();
      return query
        ? this.allSales.filter((sale: Sale) => sale.name.toLowerCase().includes(query))
        : this.allSales;
    },
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
        description: `${sale.seller ?? ""}${sale.price ? " - " + sale.price + "€" : ""}`,
        isNew: sale.isNew,
      }));
    },
  },
  mounted() {
    void this.fetchSales(false);
  },
  methods: {
    ...mapActions(useSalesStore, { loadSales: "load", markSeen: "markSeen" }),
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    async fetchSales(force = true) {
      this.loading = true;
      try {
        await this.loadSales({ force });
      } catch (err) {
        console.error("Error fetching sales:", err);
      } finally {
        this.loading = false;
      }
    },

    handleSearch(query: string) {
      this.searchQuery = query;
    },

    onSegmentChange(_value: string) {
      // no-op
    },

    async onItemClick(id: string) {
      if (!this.sales.find((s) => s.id === id)) return;

      await this.$router.push({ name: "sales-details", params: { id } });
      this.markSeen(id);
    },
  },
});
</script>
