<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <overview-header
      title="Komponenten"
      :segments="[{ value: 'all', label: 'Alle', icon: personCircle }]"
      :showAddButton="isAdmin"
      :addIcon="addCircle"
      starting-segment="all"
      @segment-change="handleSegmentChange"
      @add-click="showAddingModal = true"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="components"
        @item-click="navigateToComponent"
      ></items-overview>
      <component-adding-modal
        :is-open="showAddingModal"
        @close="showAddingModal = false"
        @added="handleComponentAdded"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

// Importing the new custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import ComponentAddingModal from "@/components/components/ComponentAddingModal.vue";

import ComponentService from "@/services/ComponentService";
import UserService from "@/services/UserService";

export default defineComponent({
  name: "ComponentOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
    ComponentAddingModal,
  },
  data() {
    return {
      components: [] as SubstrateComponent[],
      showAddingModal: false,
      isAdmin: false,
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
    };
  },
  async ionViewWillEnter() {
    this.isAdmin = await UserService.isAdmin();
    await this.fetchComponents();
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
    async handleComponentAdded() {
      this.showAddingModal = false;
      await this.fetchComponents();
    },
    navigateToComponent(id: number) {
      this.$router.push({ name: "component", params: { id: id, public: 1 } });
    },
  },
});
</script>
