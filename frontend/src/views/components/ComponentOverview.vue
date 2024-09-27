<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <overview-header
      title="Komponenten"
      :segments="[
        { value: 'all', label: 'Alle', icon: personCircle }
      ]"
      :showAddButton="showAddButton"
      :addIcon="addCircle"
      starting-segment="all"
      :onSegmentChange="handleSegmentChange"
      :onAddClick="navigateToComponentAdding"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="components"
        @item-click="navigateToComponent"
      ></items-overview>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import ComponentService from "@/services/ComponentService";

// Importing the new custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import AuthUtils from "@/utils/authUtils";

export default defineComponent({
  name: "ComponentOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      components: [] as Component[],
      showAddButton: false
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
    };
  },
  async mounted() {
    await this.fetchComponents();
    this.showAddButton = await AuthUtils.isAdmin();
  },
  methods: {
    async fetchComponents() {
      try {
        this.components = await ComponentService.getComponents();
      } catch (error) {
        console.error("Error fetching plants:", error);
      }
    },
    handleSegmentChange(value: string) {
      this.fetchComponents(); // Refetch plants based on segment change
    },
    navigateToComponent(id: number) {
      this.$router.push({ name: "component", params: { id } });
    },
    navigateToComponentAdding() {
      this.$router.push({ name: "component-adding" });
    },
  },
});
</script>
