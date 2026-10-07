<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic"
      @edit-click="openEditModal"
      :show-upload-button="!isPublic"
      @uploadClick="showUploadModal = true"
      default-href="/tabs/plants"
    />

    <ion-content>
      <div v-if="plant">
        <details-banner
          :banner-title="plant.name"
          :banner-subtitle="plant.species"
          :image-url="plant.imageUrl"
        />

        <horizontal-gallery
          :images="plant.images"
          :is-public="isPublic"
          @edit-click="handleImageEditClick"
        />

        <section class="plant-info align-middle">
          <substrate-container :substrate="fullSubstrate ?? undefined" />
          <watering-records
            :plantId="plant.id"
            :showAddButton="!isPublic"
            :showEditButton="!isPublic"
          />
          <more-info :plantName="plant.name" />
        </section>
      </div>

      <div v-else-if="!isLoading" class="ion-padding ion-text-center">
        <ion-text color="medium">
          <p>
            {{ t("error.plant_not_found", {}, "Pflanze konnte nicht geladen werden.") }}
          </p>
        </ion-text>
      </div>

      <PlantEditingModal
        v-if="plant"
        :is-open="showEditModal"
        :plant="plant"
        :substrates="substrates"
        :is-loading="isEditLoading"
        @close="showEditModal = false"
        @save="handlePlantSave"
        @delete="handlePlantDelete"
      />
      <ImageUploadModal
        :is-open="showUploadModal"
        :card-title="t('image.upload.for_name', { name: plant?.name })"
        @close="showUploadModal = false"
        @submit="onImageUpload"
        :is-loading="isImageLoading"
      />
      <ImageEditingModal
        v-if="enlargedImage"
        :is-open="showImageEditModal"
        :image="enlargedImage"
        entity-type="plant"
        @close="showImageEditModal = false"
        @edited="handleImageEdited"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { IonPage, IonContent, IonText } from "@ionic/vue";
import { defineComponent } from "vue";

import { mapActions, mapState } from "pinia";
import { usePlantsStore } from "@/stores/plants";
import { useSubstratesStore } from "@/stores/substrates";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import HorizontalGallery from "@/components/details/HorizontalGallery.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import WateringRecords from "@/components/plants/watering/WateringRecords.vue";
import MoreInfo from "@/components/plants/MoreInfo.vue";
import PlantEditingModal from "@/components/plants/PlantEditingModal.vue";
import ImageUploadModal from "@/components/images/ImageUploadModal.vue";
import ImageEditingModal from "@/components/images/ImageEditingModal.vue";

export default defineComponent({
  name: "PlantDetails",
  components: {
    IonPage,
    IonContent,
    IonText,
    DetailsHeader,
    DetailsBanner,
    HorizontalGallery,
    SubstrateContainer,
    WateringRecords,
    MoreInfo,
    PlantEditingModal,
    ImageUploadModal,
    ImageEditingModal,
  },

  props: {
    id: { type: String, required: true },
    public: { type: String, default: "0" },
  },

  data() {
    return {
      /** Full substrate object, fetched separately after plant loads (V2 only sends substrate ref) */
      fullSubstrate: null as Substrate | null,

      showEditModal: false,
      showUploadModal: false,

      enlargedImage: null as Image | null,
      showImageEditModal: false,

      isLoading: false,
      isEditLoading: false,
      isImageLoading: false,
    };
  },

  async mounted() {
    await Promise.all([this.loadPlantData(), this.fetchSubstrates()]);
  },

  computed: {
    ...mapState(usePlantsStore, ["byId"]),
    ...mapState(useSubstratesStore, { substrates: "items" }),
    /** This page's plant, straight from the store so every update repaints it. */
    plant(): Plant | null {
      return this.byId(this.plantId) ?? null;
    },
    substrateRefId(): number | undefined {
      return this.plant?.substrate?.id;
    },
    plantId() {
      return Number.parseInt(this.id);
    },
    isPublic() {
      return this.public === "1";
    },
  },

  watch: {
    // Only the full substrate is refetched, and only when the referenced one changed.
    async substrateRefId(refId: number | undefined) {
      if (!refId) {
        this.fullSubstrate = null;
      } else if (this.fullSubstrate?.id !== refId) {
        this.fullSubstrate = await this.loadSubstrate(refId).catch(() => null);
      }
    },
  },

  methods: {
    ...mapActions(useSubstratesStore, {
      loadSubstrate: "getSubstrate",
      ensureSubstratesLoaded: "ensureLoaded",
    }),
    ...mapActions(usePlantsStore, {
      loadPlant: "getPlant",
      savePlant: "editPlant",
      removePlant: "deletePlant",
      uploadPlantImage: "uploadPlantImage",
    }),

    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    /* -------------------- DATA -------------------- */

    async loadPlantData() {
      this.isLoading = true;
      try {
        await this.loadPlant(this.plantId);

        // V2 only sends a lightweight substrate reference { id, name } on the plant.
        // We need to fetch the full substrate separately to get its components.
        // This is best-effort: a substrate failure must not hide plant details.
        if (this.plant?.substrate?.id) {
          try {
            this.fullSubstrate = await this.loadSubstrate(this.plant.substrate.id);
          } catch (substrateError) {
            this.fullSubstrate = null;
            console.error("Error fetching substrate details:", substrateError);
          }
        } else {
          this.fullSubstrate = null;
        }
      } catch (error) {
        this.fullSubstrate = null;
        console.error("Error fetching plant details:", error);
      } finally {
        this.isLoading = false;
      }
    },

    async fetchSubstrates() {
      try {
        await this.ensureSubstratesLoaded();
      } catch (e) {
        console.error("Failed to fetch substrates", e);
      }
    },

    /* -------------------- EDIT -------------------- */

    openEditModal() {
      this.showEditModal = true;
    },

    async handlePlantSave(payload: EditPlant) {
      if (!this.plant) return;

      this.isEditLoading = true;
      try {
        // Optimistic: the page has already re-rendered from the store.
        await this.savePlant(this.plant.id, payload);
        ToastService.showSuccess({ key: "plant.edit.success" });
        this.showEditModal = false;
      } catch (error) {
        // handleRequest has shown the toast; the store was rolled back and
        // the page shows the previous state. Keep the modal open.
        console.error("Edit plant failed:", error);
      } finally {
        this.isEditLoading = false;
      }
    },

    async handlePlantDelete() {
      if (!this.plant) return;
      const plantId = this.plant.id;

      // Optimistic: the plant is removed from the cache immediately, so
      // navigate right away — the overview already renders without it.
      this.showEditModal = false;
      this.$router.push({ name: "plant-overview" });

      try {
        await this.removePlant(plantId);
        ToastService.showSuccess({ key: "plant.delete.success" });
      } catch (error) {
        // handleRequest has shown the toast; the rollback re-inserted the
        // plant, and the overview re-derived it back into the list.
        console.error("Delete plant failed:", error);
      }
    },

    /* -------------------- IMAGES -------------------- */

    async onImageUpload(fileItem: any) {
      if (!this.plant) return;

      try {
        this.isImageLoading = true;
        // The store refreshes this plant itself; the gallery re-renders from it.
        await this.uploadPlantImage(this.plant.id, fileItem.file, fileItem.date);
        this.showUploadModal = false;
      } catch (error) {
        console.error("Error uploading image:", error);
      } finally {
        this.isImageLoading = false;
      }
    },

    handleImageEditClick(image: Image) {
      this.enlargedImage = image;
      this.showImageEditModal = true;
    },

    async handleImageEdited() {
      // Images are edited via ImageService and are embedded in the plant
      // object: force-refresh this plant; the gallery re-renders from the store.
      await this.loadPlant(this.plantId, true).catch(() => undefined);
      this.showImageEditModal = false;
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

.plant-banner {
  position: relative;
  width: 100%;
  height: 500px;
  overflow: hidden;
}

.plant-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plant-banner-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5); /* Dark overlay for readability */
  color: white;
  text-align: left;
}

.plant-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.plant-species {
  font-size: 1.2rem;
  margin-top: 5px;
}

.plant-info {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transition: background 0.3s ease;
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
