<template>
  <ion-page>
    <overview-header
      :title="t('components.title')"
      :segments="[
        { value: 'all', label: t('segment.all'), icon: personCircle },
      ]"
      :showAddButton="isAdmin"
      :addIcon="addCircle"
      starting-segment="all"
      @segment-change="handleSegmentChange"
      @add-click="showAddingModal = true"
    />

    <items-overview
      :items="mapToOverviewItems"
      @item-click="navigateToComponent"
      @refresh-items="refreshComponents"
    ></items-overview>

    <component-adding-modal
      :is-open="showAddingModal"
      @close="showAddingModal = false"
      @added="handleComponentAdded"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import ComponentAddingModal from "@/components/components/ComponentAddingModal.vue";

import ComponentService from "@/services/ComponentService";
import UserService from "@/services/UserService";
import localizationService from "@/services/general/LocalizationService";

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
      // 1. Initialized as empty array to ensure first render is safe
      components: [] as Component[],
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
  computed: {
    mapToOverviewItems(): OverviewItem[] {
      return this.components.map((component) => ({
        id: component.id,
        name: component.name,
        description: component.fineness,
        imageUrl: component.imageUrl
      }));
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    /**
     * Helper to centralize component loading logic
     */
    async loadComponents(forceUpdate = false) {
      try {
        const response = await ComponentService.getAllComponents(forceUpdate);

        // 2. Defensive Assignment: Ensure we never assign null/undefined to this.components
        this.components = response || [];
      } catch (error) {
        // 3. Reset to empty array on catch to prevent template crashes
        this.components = [];
        console.error(
          `Error ${forceUpdate ? "refreshing" : "fetching"} components:`,
          error
        );
      }
    },

    async fetchComponents() {
      await this.loadComponents(false);
    },

    async refreshComponents() {
      await this.loadComponents(true);
    },

    handleSegmentChange() {
      this.fetchComponents();
    },

    async handleComponentAdded() {
      this.showAddingModal = false;
      await this.fetchComponents();
    },

    navigateToComponent(id: number) {
      this.$router.push({
        name: "component-details",
        params: { id: id, public: 1 },
      });
    },
  },
});
</script>
