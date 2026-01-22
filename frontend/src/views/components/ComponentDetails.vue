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
import {
  IonPage,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardContent,
} from "@ionic/vue";
import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import ComponentEditingModal from "@/components/components/ComponentEditingModal.vue";
import ComponentService from "@/services/ComponentService";
import UserService from "@/services/UserService";
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
      component: null as Component | null,
      showEditingModal: false,
      isAdmin: false,
      isEditing: false,
    };
  },
  async ionViewDidEnter() {
    this.isAdmin = await UserService.isAdmin();
    await this.fetchComponent();
  },
  computed: {
    componentId() {
      return Number(this.id);
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, {}, key);
    },
    async fetchComponent() {
      try {
        this.component = await ComponentService.getComponentById(
          this.componentId
        );
      } catch (error) {
        console.error("Error fetching component details:", error);
      }
    },
    async handleComponentSave(updated: EditComponent) {
      if (!this.component) return;
      this.isEditing = true;
      try {
        const response = await ComponentService.editComponent(
          this.component.id,
          updated
        );
        if (response) {
          this.showEditingModal = false;
          await this.fetchComponent();
          ToastService.showSuccess({
            key: "components.edit.success",
            fallback: "Component edited successfully",
          });
        }
      } catch (error) {
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
        const response = await ComponentService.deleteComponent(id);
        if (response) {
          this.showEditingModal = false;
          ToastService.showSuccess({
            key: "components.delete.success",
            fallback: "Component deleted successfully",
          });
          this.$router.push({ name: "component-overview" });
        }
      } catch (error) {
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
