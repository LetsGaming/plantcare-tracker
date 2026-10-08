<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic"
      @edit-click="openEditModal"
      :show-upload-button="!isPublic"
      @uploadClick="showUploadModal = true"
      default-back-href="/tabs/plants"
    />

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="onRefresh">
        <ion-refresher-content />
      </ion-refresher>

      <state-block
        v-if="!plant && isLoading"
        kind="loading"
        :title="t('plantdetail.loading')"
        :skeletons="1"
      />

      <state-block
        v-else-if="!plant && loadFailed"
        kind="error"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="loadPlantData"
      />

      <state-block
        v-else-if="!plant"
        kind="not-found"
        :title="t('state.not_found_title')"
        :message="t('state.not_found_message')"
        :action-label="t('state.back_to_list')"
        @action="goToList"
      />

      <article v-else class="plant-page">
        <plant-tag
          class="area-tag"
          :name="plant.name"
          :species="plant.species"
          :is-public="plant.isPublic"
        />

        <watering-status
          class="area-status"
          :plant-id="plant.id"
          :plant-name="plant.name"
          :can-water="canEdit"
          @add-details="openWateringForm"
        />

        <div class="area-photo">
          <details-banner :banner-title="plant.name" :image-url="plant.imageUrl" image-only />
          <horizontal-gallery
            :images="plant.images"
            :is-public="isPublic"
            :plant-name="plant.name"
            @edit-click="handleImageEditClick"
            @upload-click="showUploadModal = true"
          />
        </div>

        <watering-records
          ref="records"
          class="area-calendar"
          :plantId="plant.id"
          :showAddButton="canEdit"
          :showEditButton="canEdit"
        />

        <div class="area-substrate">
          <substrate-container :substrate="fullSubstrate ?? undefined" />
        </div>

        <more-info class="area-guide" :plantName="plant.name" />
      </article>

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
import { IonPage, IonContent, IonRefresher, IonRefresherContent } from "@ionic/vue";
import { defineComponent } from "vue";

import { mapActions, mapState } from "pinia";
import { usePlantsStore } from "@/stores/plants";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import { useWateringStore } from "@/stores/watering";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import HorizontalGallery from "@/components/details/HorizontalGallery.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import PlantTag from "@/components/plants/PlantTag.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import WateringStatus from "@/components/plants/watering/WateringStatus.vue";
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
    IonRefresher,
    IonRefresherContent,
    DetailsHeader,
    DetailsBanner,
    HorizontalGallery,
    StateBlock,
    PlantTag,
    SubstrateContainer,
    WateringStatus,
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

      isLoading: true,
      loadFailed: false,
      hasEntered: false,
      isEditLoading: false,
      isImageLoading: false,
    };
  },

  async ionViewWillEnter() {
    // A re-entry refreshes in the background; the cached plant stays on screen meanwhile.
    const refetch = this.hasEntered;
    this.hasEntered = true;
    await Promise.all([this.loadPlantData(refetch), this.fetchSubstrates()]);
  },

  computed: {
    ...mapState(usePlantsStore, ["byId"]),
    ...mapState(useSubstratesStore, { substrates: "items" }),
    ...mapState(useSessionStore, ["isGuest", "userId"]),
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
      return this.plant ? this.plant.userId !== this.userId : this.public === "1";
    },
    canEdit(): boolean {
      return !this.isPublic && !this.isGuest;
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
    ...mapActions(useWateringStore, { reloadRecords: "ensureRecords" }),

    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback ?? key);
    },

    /* -------------------- DATA -------------------- */

    async loadPlantData(force = false) {
      this.isLoading = true;
      this.loadFailed = false;
      try {
        await this.loadPlant(this.plantId, force);

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
        // A plant that is already on screen stays; only an empty page shows the failure.
        this.loadFailed = (error as { status?: number })?.status !== 404;
        console.error("Error fetching plant details:", error);
      } finally {
        this.isLoading = false;
      }
    },

    async onRefresh(event: CustomEvent) {
      try {
        await Promise.all([
          this.loadPlantData(true),
          this.reloadRecords(this.plantId, { force: true }).catch(() => undefined),
        ]);
      } finally {
        (event.target as HTMLIonRefresherElement).complete();
      }
    },

    async fetchSubstrates() {
      try {
        await this.ensureSubstratesLoaded();
      } catch (e) {
        console.error("Failed to fetch substrates", e);
      }
    },

    goToList() {
      this.$router.replace({ name: "plant-overview" });
    },

    openWateringForm() {
      (this.$refs.records as InstanceType<typeof WateringRecords> | undefined)?.openAdd();
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
      // navigate right away; the overview already renders without it.
      this.showEditModal = false;
      this.$router.replace({ name: "plant-overview" });

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
.plant-page {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  width: 100%;
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

.plant-page > * {
  min-width: 0;
}

.area-photo {
  display: grid;
  gap: var(--space-4);
  align-content: start;
}

@media (min-width: 900px) {
  .plant-page {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas:
      "tag tag"
      "photo status"
      "photo calendar"
      "substrate guide";
    align-items: start;
    gap: var(--space-5);
    padding: var(--space-5);
  }

  .area-tag {
    grid-area: tag;
  }

  .area-status {
    grid-area: status;
  }

  .area-photo {
    grid-area: photo;
  }

  .area-calendar {
    grid-area: calendar;
  }

  .area-substrate {
    grid-area: substrate;
  }

  .area-guide {
    grid-area: guide;
  }
}
</style>
