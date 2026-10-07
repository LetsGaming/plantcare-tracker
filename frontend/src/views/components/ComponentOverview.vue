<template>
  <ion-page>
    <overview-header
      :title="t('components.title')"
      :segments="[{ value: 'all', label: t('segment.all'), icon: personCircle }]"
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
import { IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import ComponentAddingModal from "@/components/components/ComponentAddingModal.vue";

import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ComponentOverview",
  components: {
    IonPage,
    OverviewHeader,
    ItemsOverview,
    ComponentAddingModal,
  },
  data() {
    return {
      showAddingModal: false,
      isAdding: false,
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
    await this.fetchComponents();
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useComponentsStore, { components: "items" }),
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

    ...mapActions(useComponentsStore, {
      ensureComponentsLoaded: "ensureLoaded",
      createComponent: "addComponent",
      uploadComponentImage: "uploadComponentImage",
    }),

    async loadComponents(forceUpdate = false) {
      try {
        await this.ensureComponentsLoaded({ force: forceUpdate });
      } catch (error) {
        console.error(`Error ${forceUpdate ? "refreshing" : "fetching"} components:`, error);
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
        const created = await this.createComponent(componentData);
        if (componentData.image) {
          await this.uploadComponentImage(created.id, componentData.image);
        }
        this.showAddingModal = false;
        ToastService.showSuccess({
          key: "components.add.success",
          fallback: "Component added successfully",
        });
      } catch {
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
