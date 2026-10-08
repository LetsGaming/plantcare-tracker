<template>
  <ion-page>
    <overview-header
      :title="t('components.title')"
      :show-add-button="isAdmin"
      :add-icon="icons.add"
      @add-click="showAddingModal = true"
    />

    <items-overview
      :items="mapToOverviewItems"
      kind="component"
      :is-loading="isLoadingList"
      :has-error="hasError"
      :empty-title="t('state.empty_components_title')"
      :empty-message="emptyMessage"
      :empty-action-label="emptyActionLabel"
      @item-click="navigateToComponent"
      @refresh-items="refreshComponents"
      @retry="refreshComponents"
      @empty-action="showAddingModal = true"
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
import { icons } from "@/theme/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import ComponentAddingModal from "@/components/components/ComponentAddingModal.vue";

import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";
import { finenessLabel } from "@/utils/enumLabels";

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
    return { icons };
  },
  async ionViewWillEnter() {
    await this.fetchComponents();
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useComponentsStore, { components: "items", status: "status" }),
    isLoadingList(): boolean {
      return this.status === "loading" || this.status === "idle";
    },
    hasError(): boolean {
      return this.status === "error";
    },
    emptyMessage(): string {
      return this.t(
        this.isAdmin ? "shell.empty_components_admin_message" : "state.empty_components_message",
      );
    },
    emptyActionLabel(): string {
      return this.isAdmin ? this.t("shell.empty_components_action") : "";
    },
    mapToOverviewItems(): OverviewItem[] {
      return this.components.map((component) => ({
        id: component.id,
        name: component.name,
        description: finenessLabel(component.fineness),
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
        let photoSaved = true;
        if (componentData.image) {
          try {
            await this.uploadComponentImage(created.id, componentData.image);
          } catch (error) {
            console.error("Component image upload failed:", error);
            photoSaved = false;
          }
        }
        this.showAddingModal = false;
        if (photoSaved) {
          ToastService.showSuccess({
            key: "components.add.success",
            fallback: "Component added successfully",
          });
        } else {
          ToastService.showWarning({ key: "shell.photo_failed_component" });
        }
      } catch {
        // The store already reported the failure.
      } finally {
        this.isAdding = false;
      }
    },
  },
});
</script>
