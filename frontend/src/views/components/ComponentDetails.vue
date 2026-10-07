<template>
  <ion-page>
    <details-header
      :show-edit-button="isAdmin"
      @edit-click="showEditingModal = true"
      default-href="/tabs/components"
    />
    <ion-content>
      <div v-if="component">
        <details-banner
          :banner-title="component.name"
          :banner-subtitle="component.fineness"
          :image-url="component.imageUrl"
        />
        <section class="component-info align-middle">
          <ion-card class="component-banner-content align-middle">
            <ion-card-header>
              <h2 class="component-name">{{ component.name }}</h2>
            </ion-card-header>
            <ion-card-content>
              <p class="component-fineness">
                {{ t("component.fineness_prefix") }} {{ component.fineness }}
              </p>
            </ion-card-content>
          </ion-card>
        </section>
      </div>

      <component-editing-modal
        v-if="component"
        :is-open="showEditingModal"
        :component="component"
        :is-loading="isEditing"
        @close="showEditingModal = false"
        @save="handleComponentSave"
        @delete="handleComponentDelete"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonCard, IonCardHeader, IonCardContent } from "@ionic/vue";
import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import ComponentEditingModal from "@/components/components/ComponentEditingModal.vue";
import { mapActions, mapState } from "pinia";
import { useComponentsStore } from "@/stores/components";
import { useSessionStore } from "@/stores/session";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ComponentDetails",
  components: {
    IonPage,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardContent,
    DetailsHeader,
    DetailsBanner,
    ComponentEditingModal,
  },
  props: { id: { type: String, required: true } },
  data() {
    return {
      showEditingModal: false,
      isEditing: false,
    };
  },
  async ionViewDidEnter() {
    await this.fetchComponent();
  },
  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useComponentsStore, ["byId"]),
    /** This page's component, straight from the store so every update repaints it. */
    component(): Component | null {
      return this.byId(this.componentId) ?? null;
    },
    componentId() {
      return Number(this.id);
    },
  },
  methods: {
    ...mapActions(useComponentsStore, {
      loadComponent: "getComponent",
      saveComponent: "editComponent",
      removeComponent: "deleteComponent",
    }),
    t(key: string) {
      return localizationService.t(key, {}, key);
    },
    async fetchComponent() {
      try {
        await this.loadComponent(this.componentId);
      } catch (error) {
        console.error("Error fetching component details:", error);
      }
    },
    async handleComponentSave(updated: EditComponent) {
      if (!this.component) return;
      this.isEditing = true;
      try {
        await this.saveComponent(this.component.id, updated);
        this.showEditingModal = false;
        ToastService.showSuccess({
          key: "components.edit.success",
          fallback: "Component edited successfully",
        });
      } catch {
        ToastService.showError({
          key: "components.edit.failed",
          fallback: "Error editing component",
        });
      } finally {
        this.isEditing = false;
      }
    },
    async handleComponentDelete(id: number) {
      this.isEditing = true;
      try {
        await this.removeComponent(id);
        this.showEditingModal = false;
        ToastService.showSuccess({
          key: "components.delete.success",
          fallback: "Component deleted successfully",
        });
        this.$router.push({ name: "component-overview" });
      } catch {
        ToastService.showError({
          key: "components.delete.failed",
          fallback: "Error deleting component",
        });
      } finally {
        this.isEditing = false;
      }
    },
  },
});
</script>

<style scoped>
:root {
  --background-color: var(--ion-color-light);
  --card-background-color: var(--ion-color-white);
  --header-background-color: var(--ion-color-light-tint);
  --text-color: var(--ion-color-dark);
  --detail-text-color: var(--ion-color-medium);
  --accent-color: var(--ion-color-primary);
}

.component-banner {
  position: relative;
  width: 100%;
  height: 800px;
  overflow: hidden;
}

.component-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.component-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.component-fineness {
  font-size: 1.2rem;
  margin-top: 5px;
}

.component-info {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  transition: background 0.3s ease;
}

.component-banner-content {
  flex-flow: column !important;
}

.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
