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
    />

    <component-adding-modal
      :is-open="showAddingModal"
      :is-loading="isAdding"
      @close="showAddingModal = false"
      @save="handleComponentSave"
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
import ToastService from "@/services/general/ToastService";
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
      components: [] as Component[],
      showAddingModal: false,
      isAdding: false,
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
        imageUrl: component.imageUrl,
      }));
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    async loadComponents(forceUpdate = false) {
      try {
        const response = await ComponentService.getAllComponents(forceUpdate);
        this.components = response || [];
      } catch (error) {
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

    navigateToComponent(id: number) {
      this.$router.push({
        name: "component-details",
        params: { id: id, public: 1 },
      });
    },
    async handleComponentSave(componentData: AddComponent) {
      this.isAdding = true;
      try {
        const response = await ComponentService.addComponent(componentData);
        if (!response) return;
        if (componentData.image) {
          await ComponentService.uploadComponentImage(
            response.id,
            componentData.image
          );
        }
        this.showAddingModal = false;
        await this.fetchComponents();
        ToastService.showSuccess({
          key: "components.add.success",
          fallback: "Component added successfully",
        });
      } catch (error) {
        ToastService.showError({
          key: "components.add.failed",
          fallback: "Failed to add component",
        });
      } finally {
        this.isAdding = false;
      }
    },
  },
});
</script>
