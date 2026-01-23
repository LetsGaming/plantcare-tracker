<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic"
      @edit-click="showEditModal = true"
      :show-upload-button="!isPublic"
      @upload-click="toggleUpload"
      default-href="/tabs/substrates"
    ></details-header>

    <ion-content>
      <div v-if="substrate">
        <details-banner
          :banner-title="substrate.name"
          :image-url="substrate.imageUrl"
        />

        <section class="substrate-info align-middle">
          <SubstrateContainer :substrate="substrate"></SubstrateContainer>
        </section>
      </div>

      <ImageUploadModal
        :is-open="showUploadModal"
        :card-title="t('image.upload.for_name', { name: substrate?.name })"
        @close="showUploadModal = false"
        @submit="onImageUpload"
        :is-loading="isLoading"
      />

      <SubstrateEditingModal
        v-if="substrate"
        :is-open="showEditModal"
        :substrate="substrate"
        :available-components="availableComponents"
        :is-loading="isSubmitting"
        @close="showEditModal = false"
        @save="handleSubstrateUpdate"
        @delete="handleSubstrateDelete"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import SubstrateService from "@/services/SubstrateService";
import ComponentService from "@/services/ComponentService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import ImageUploadModal from "@/components/images/ImageUploadModal.vue";
import SubstrateEditingModal from "@/components/substrates/SubstrateEditingModal.vue";

export default defineComponent({
  name: "SubstrateDetails",
  components: {
    IonPage,
    IonContent,
    DetailsHeader,
    DetailsBanner,
    SubstrateContainer,
    ImageUploadModal,
    SubstrateEditingModal,
  },
  props: {
    id: { type: String, required: true },
    public: { type: String, default: "0" },
  },
  data() {
    return {
      substrate: null as null | Substrate,
      availableComponents: [] as SubstrateComponent[],
      showUploadModal: false,
      showEditModal: false,
      isLoading: false, // For image upload
      isSubmitting: false, // For substrate editing
    };
  },
  computed: {
    substrateId(): number {
      return Number.parseInt(this.id);
    },
    isPublic(): boolean {
      return this.public === "1";
    },
  },
  async mounted() {
    await Promise.all([this.fetchSubstrate(), this.fetchAvailableComponents()]);
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    async fetchSubstrate(forceUpdate = false) {
      try {
        this.substrate = await SubstrateService.getSubstrateById(
          this.substrateId,
          forceUpdate,
        );
      } catch (error) {
        console.error("Error fetching substrate:", error);
      }
    },

    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getAllComponents();
        this.availableComponents = response
          .map((comp: Component) => ({
            ...comp,
            description: comp.fineness || "",
            parts: 0,
          }))
          .sort((a: SubstrateComponent, b: SubstrateComponent) =>
            a.name.localeCompare(b.name),
          );
      } catch (error) {
        console.error("Error fetching available components:", error);
      }
    },

    toggleUpload() {
      this.showUploadModal = !this.showUploadModal;
    },

    async handleSubstrateUpdate(payload: {
      meta: any;
      componentIds: number[];
      parts: Record<number, number>;
    }) {
      if (!this.substrate) return;

      const { meta, componentIds, parts } = payload;

      const metaChanged = this.hasMetaChanged(meta);
      const componentsChanged = this.haveComponentsChanged(componentIds, parts);

      if (!metaChanged && !componentsChanged) {
        return ToastService.showWarning({ key: "substrate.no_changes" });
      }

      this.isSubmitting = true;
      try {
        await this.updateSubstrate(
          metaChanged,
          componentsChanged,
          meta,
          componentIds,
          parts,
        );
        await this.fetchSubstrate(); // Refresh data
        this.showEditModal = false;
      } catch {
        ToastService.showError({ key: "substrate.update_error" });
      } finally {
        this.isSubmitting = false;
      }
    },

    /** Check if meta data changed */
    hasMetaChanged(meta: any): boolean {
      return (
        meta.name !== this.substrate?.name ||
        meta.isPublic !== this.substrate?.isPublic ||
        !!meta.image
      );
    },

    /** Check if component list changed */
    haveComponentsChanged(
      componentIds: number[],
      parts: Record<number, number>,
    ): boolean {
      const currentComps = this.sortedComponents(componentIds, parts);
      const oldComps = this.sortedComponentsFromSubstrate();
      return JSON.stringify(currentComps) !== JSON.stringify(oldComps);
    },

    /** Sort and map new components */
    sortedComponents(componentIds: number[], parts: Record<number, number>) {
      return componentIds
        .map((id) => ({ componentId: id, parts: parts[id] || 1 }))
        .sort((a, b) => a.componentId - b.componentId);
    },

    /** Sort and map existing substrate components */
    sortedComponentsFromSubstrate() {
      return this.substrate?.components
        .map((c) => ({ componentId: c.id, parts: c.parts }))
        .sort((a, b) => a.componentId - b.componentId);
    },

    /** Perform the actual update */
    async updateSubstrate(
      metaChanged: boolean,
      componentsChanged: boolean,
      meta: any,
      componentIds: number[],
      parts: Record<number, number>,
    ) {
      const tasks = [];

      if (componentsChanged) {
        tasks.push(
          SubstrateService.editSubstrateComponents(
            this.substrate?.id || -1,
            this.sortedComponents(componentIds, parts),
          ),
        );
      }

      if (metaChanged) {
        tasks.push(
          SubstrateService.editSubstrate(this.substrate?.id || -1, {
            name: meta.name,
            isPublic: meta.isPublic,
            image: meta.image || undefined,
          }),
        );
      }

      await Promise.all(tasks);

      const toastKey =
        metaChanged && componentsChanged
          ? "substrate.updated_both"
          : componentsChanged
            ? "substrate.components_updated"
            : "substrate.updated";

      ToastService.showSuccess({ key: toastKey });
    },
    async handleSubstrateDelete(id: number) {
      try {
        this.isSubmitting = true;
        await SubstrateService.deleteSubstrate(id);
        ToastService.showSuccess({ key: "substrate.deleted" });
        this.showEditModal = false;
        this.$router.push({ name: "substrate-overview" });
      } catch (error) {
        ToastService.showError({ key: "substrate.delete_error" });
      } finally {
        this.isSubmitting = false;
      }
    },

    async onImageUpload(fileItem: any) {
      if (!this.substrate) return;
      try {
        this.isLoading = true;
        await SubstrateService.uploadSubstrateImage(
          this.substrate.id,
          fileItem.file,
          fileItem.date,
        );
        await this.fetchSubstrate();
        this.showUploadModal = false;
      } catch (error) {
        console.error("Error uploading image:", error);
      } finally {
        this.isLoading = false;
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

.substrate-banner {
  position: relative;
  width: 100%;
  height: 500px;
  overflow: hidden;
}

.substrate-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.substrate-banner-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5); /* Dark overlay for readability */
  color: white;
  text-align: left;
}

.substrate-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.substrate-type {
  font-size: 1.2rem;
  margin-top: 5px;
}

.substrate-info {
  padding: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transition: background 0.3s ease;
}
</style>
