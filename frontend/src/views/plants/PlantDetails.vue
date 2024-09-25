<template>
  <ion-page>
    <details-header :show-edit-button="true" @edit-click="navigateToPlantEditing" default-href="/tabs/plants/overview"></details-header>
    <ion-content>
      <div v-if="plant">
        <!-- Full-width banner with dynamic plant image -->
        <section class="plant-banner">
          <ion-img
            :src="plant.imageUrl || '/no-image.png'"
            alt="Plant Image"
            class="plant-banner-image"
          />
          <div class="plant-banner-content">
            <h2 class="plant-name">{{ plant.name }}</h2>
            <p class="plant-species">{{ plant.species }}</p>
          </div>
        </section>

        <section class="plant-info">
          <horizontal-gallery :images="plant.images"></horizontal-gallery>
          <substrate-container
            :substrate="plant.substrate"
          ></substrate-container>
        </section>
      </div>
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

import DetailsHeader from "@/components/details/DetailsHeader.vue";
import HorizontalGallery from "@/components/details/HorizontalGallery.vue";
import SubstrateContainer from "@/components/plants/SubstrateContainer.vue";

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
    HorizontalGallery,
    SubstrateContainer,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      plant: null as null | Plant,
    };
  },
  async mounted() {
    try {
      this.plant = await PlantService.getPlantById(this.plantId, this.isPublic);
    } catch (error) {
      console.error("Error fetching plant details:", error);
    }
  },
  computed: {
    plantId() {
      return Number.parseInt(this.id);
    },
  },
  methods: {
    navigateToPlantEditing() {
      const id = this.plantId;
      const isPublic = this.plant?.isPublic ? 1 : 0;

      this.$router.push({ name: "plant-editing", params: { id: id, isPublic: isPublic } });
    },
  }
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
