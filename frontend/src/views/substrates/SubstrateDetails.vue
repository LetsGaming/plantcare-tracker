<template>
  <ion-page>
    <details-header
      :show-edit-button="!isPublic"
      @edit-click="showEditModal = true"
      :show-upload-button="!isPublic"
      @upload-click="toggleUpload"
      default-href="/tabs/substrate/overview"
    ></details-header>

    <ion-content>
      <div v-if="substrate">
        <!-- Full-width banner with dynamic substrate image -->
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
        @close="showEditModal = false"
        @edited="handleSubstrateEdited"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonImg,
} from "@ionic/vue";
import SubstrateService from "@/services/SubstrateService";

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import DetailsBanner from "@/components/details/DetailsBanner.vue";
import SubstrateContainer from "@/components/substrates/SubstrateContainer.vue";
import ImageUploadModal from "@/components/images/ImageUploadModal.vue";
import SubstrateEditingModal from "@/components/substrates/SubstrateEditingModal.vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SubstrateDetails",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonImg,

    DetailsHeader,
    DetailsBanner,
    SubstrateContainer,
    ImageUploadModal,
    SubstrateEditingModal,
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
      substrate: null as null | Substrate,
      showUploadModal: false,
      showEditModal: false,
      isLoading: false,
    };
  },
  async mounted() {
    try {
      await this.fetchSubstrate();
    } catch (error) {
      console.error("Error fetching substrate details:", error);
    }
  },
  computed: {
    substrateId() {
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
    toggleUpload() {
      this.showUploadModal = !this.showUploadModal;
    },
    async fetchSubstrate(forceUpdate = false) {
      this.substrate = await SubstrateService.getSubstrateById(
        this.substrateId,
        forceUpdate
      );
    },
    async onImageUpload(fileItem: any) {
      if (this.substrate) {
        try {
          this.isLoading = true;
          await SubstrateService.uploadSubstrateImage(
            this.substrate.id,
            fileItem.file,
            fileItem.date
          );
          await this.fetchSubstrate();
          this.isLoading = false;
          this.$nextTick(() => {
            this.toggleUpload();
          });
        } catch (error) {
          this.isLoading = false;
          console.error("Error uploading image:", error);
        }
      }
    },
    async handleSubstrateEdited() {
      this.showEditModal = false;
      try {
        await this.fetchSubstrate();
      } catch (error) {
        console.error("Error fetching substrate details:", error);
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
