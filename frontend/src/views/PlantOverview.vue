<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <ion-header>
      <ion-toolbar class="header-toolbar">
        <ion-title>Plants</ion-title>
      </ion-toolbar>

      <ion-toolbar class="segment-toolbar">
        <ion-segment v-model="showPublic" @ionChange="fetchPlants">
          <ion-segment-button value="public">
            <ion-icon :icon="peopleCircle" />
            <ion-label>Öffentlich</ion-label>
          </ion-segment-button>
          <ion-segment-button value="private">
            <ion-icon :icon="personCircle" />
            <ion-label>Persönlich</ion-label>
          </ion-segment-button>
        </ion-segment>
        <ion-icon :icon="addCircle" style="width: 32px; height: 32px;" slot="end" @click="navigateToPlantAdding()"></ion-icon>
      </ion-toolbar>
    </ion-header>

    <!-- Content Area -->
    <ion-content>
      <ion-grid class="plant-grid">
        <ion-row>
          <ion-col
            size="6"
            size-md="4"
            size-lg="3"
            v-for="plant in plants"
            :key="plant.id"
          >
            <ion-card class="plant-card" @click="navigateToPlant(plant.id)">
              <ion-img
                :src="plant.imageUrl || '../../public/no-image.png'"
                alt="Plant Image"
                class="plant-image"
              />
              <ion-card-header>
                <ion-card-title>{{ plant.name }}</ion-card-title>
              </ion-card-header>
              <ion-card-content>
                <ion-text color="medium">Click for details</ion-text>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import PlantService from "@/services/PlantService";
import PlantDetails from "@/components/plants/PlantDetails.vue";
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonSegment,
  IonSegmentButton,
  IonIcon,
  IonLabel,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonText,
  IonImg
} from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

export default {
  name: "PlantOverview",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonSegment,
    IonSegmentButton,
    IonIcon,
    IonLabel,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonText,
    IonImg,

    PlantDetails,
  },
  data() {
    return {
      plants: [] as Plant[],
      showPublic: "private",
      selectedPlant: null as null | Plant,
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle
    };
  },
  mounted() {
    this.fetchPlants();
  },
  computed: {
    isPublic() {
      return this.showPublic === "public";
    },
  },
  methods: {
    async fetchPlants() {
      try {
        this.plants = await PlantService.getPlants(this.isPublic);
      } catch (error) {
        console.error("Error fetching plants:", error);
      }
    },
    navigateToPlant(id: number) {
      this.$router.push({ name: "plant", params: { id }});
    },
    navigateToPlantAdding() {
      this.$router.push({ name: "plant-adding" });
    }
  },
};
</script>

<style scoped>
.header-toolbar {
  background-color: var(--ion-color-primary);
  color: white;
}

.segment-toolbar {
  background-color: var(--ion-color-light);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.plant-grid {
  padding: 20px;
}

.plant-card {
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border-radius: 15px;
}

.plant-card:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.plant-image {
  width: 126px;
  height: 126px;
  border-radius: 15px 15px 0 0;
}
</style>
