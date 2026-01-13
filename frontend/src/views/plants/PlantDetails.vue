<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic"
      @edit-click="showEditModal = true"
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
          <substrate-container :substrate="plant.substrate" />
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
            {{
              t(
                "error.plant_not_found",
                {},
                "Pflanze konnte nicht geladen werden."
              )
            }}
          </p>
        </ion-text>
      </div>

      <PlantEditingModal
        v-if="plant"
        :is-open="showEditModal"
        :plant="plant"
        @close="showEditModal = false"
        @edited="handlePlantEdited"
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
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonImg,
  IonText,
} from "@ionic/vue";
import { defineComponent } from "vue";
import PlantService from "@/services/PlantService";
import localizationService from "@/services/general/LocalizationService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import HorizontalGallery from "@/components/details/HorizontalGallery.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import WateringRecords from "@/components/plants/watering/WateringRecords.vue";
import MoreInfo from "@/components/plants/MoreInfo.vue";
import PlantEditingModal from "../../components/plants/PlantEditingModal.vue";
import ImageUploadModal from "@/components/images/ImageUploadModal.vue";
import ImageEditingModal from "@/components/images/ImageEditingModal.vue";

export default defineComponent({
  name: "PlantDetails",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonImg,
    IonText,

    DetailsHeader,
    DetailsBanner,
    HorizontalGallery,
    SubstrateContainer,
    WateringRecords,
    MoreInfo,
    ImageUploadModal,
    ImageEditingModal,
    PlantEditingModal,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    public: {
      type: String,
      default: "0",
    },
  },
  data() {
    return {
      plant: null as null | Plant,
      wateringRecords: [] as WateringRecord[],
      showEditModal: false,
      showUploadModal: false,
      enlargedImage: null as Image | null,
      showImageEditModal: false,
      isLoading: false,
      isImageLoading: false,
    };
  },
  async mounted() {
    await this.loadPlantData();
  },
  computed: {
    plantId() {
      return Number.parseInt(this.id);
    },
    isPublic() {
      return this.public === "1";
    },
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    /**
     * Unified loading logic to handle service rework.
     * Prevents crashes by explicitly checking for null/undefined response.
     */
    async loadPlantData(forceRefresh = false) {
      this.isLoading = true;
      try {
        const response = await PlantService.getPlantById(
          this.plantId,
          this.isPublic,
          forceRefresh
        );

        // Defensive Assignment: Ensure we stay at null if response is undefined
        this.plant = response || null;
      } catch (error) {
        this.plant = null;
        console.error("Error fetching plant details:", error);
      } finally {
        this.isLoading = false;
      }
    },

    async handlePlantEdited() {
      await this.loadPlantData(true);
      this.showEditModal = false;
    },

    async onImageUpload(fileItem: any) {
      if (this.plant) {
        try {
          this.isImageLoading = true;
          await PlantService.uploadPlantImage(
            this.plant.id,
            fileItem.file,
            fileItem.date
          );
          // Refresh data to update image list/banner
          await this.loadPlantData(true);
          this.isImageLoading = false;
          this.$nextTick(() => {
            this.showUploadModal = false;
          });
        } catch (error) {
          this.isImageLoading = false;
          console.error("Error uploading image:", error);
        }
      }
    },

    async handleImageEditClick(image: Image) {
      this.enlargedImage = image;
      this.showImageEditModal = true;
    },

    async handleImageEdited() {
      try {
        await this.loadPlantData(true);
        this.showImageEditModal = false;
      } catch (error) {
        console.error("Error editing image:", error);
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
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
