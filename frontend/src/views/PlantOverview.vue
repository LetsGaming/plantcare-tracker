<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>Plants</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Public/Private Toggle -->
      <ion-toolbar>
        <ion-segment v-model="showPublic" @ionChange="fetchPlants" style="width: 100%">
          <ion-segment-button value="public">
            <ion-icon :icon="peopleCircle" />
            <ion-label>Public Plants</ion-label>
          </ion-segment-button>
          <ion-segment-button value="private">
            <ion-icon :icon="personCircle" />
            <ion-label>Private Plants</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>

      <!-- Plant Cards Grid -->
      <ion-row class="plant-list">
        <ion-col size="4" v-for="plant in plants" :key="plant.id">
          <ion-card @click="viewPlant(plant.id)" class="plant-card">
            <ion-card-header>
              <ion-card-title>{{ plant.name }}</ion-card-title>
            </ion-card-header>
            <ion-card-content>
              <ion-text color="medium">Click for details</ion-text>
            </ion-card-content>
          </ion-card>
        </ion-col>
      </ion-row>
      <PlantDetails :selectedPlant="selectedPlant"></PlantDetails>
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
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonText,
} from "@ionic/vue";
import { peopleCircle, personCircle } from "ionicons/icons";

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
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonText,

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
    return { peopleCircle, personCircle };
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
    resetPlants() {
      this.plants = [] as Plant[];
      this.selectedPlant = null;
    },
    async fetchPlants() {
      try {
        this.resetPlants();
        this.plants = await PlantService.getPlants(this.isPublic);
      } catch (error) {
        console.error("Error fetching plants:", error);
      }
    },
    async viewPlant(plantId: number) {
      try {
        this.selectedPlant = await PlantService.getPlantById(plantId, this.isPublic);
      } catch (error) {
        console.error("Error fetching plant details:", error);
      }
    },
  },
};
</script>

<style scoped>
.plant-list {
  padding: 16px;
}

.plant-card {
  transition: transform 0.2s;
}

.plant-card:hover {
  transform: scale(1.02);
}

</style>
