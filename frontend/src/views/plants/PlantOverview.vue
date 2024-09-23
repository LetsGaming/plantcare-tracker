<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <overview-header
      title="Plants"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        { value: 'private', label: 'Persönlich', icon: personCircle },
      ]"
      :showAddButton="true"
      :addIcon="addCircle"
      starting-segment="private"
      :onSegmentChange="handleSegmentChange"
      :onAddClick="navigateToPlantAdding"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="plants"
        @item-click="navigateToPlant"
      ></items-overview>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import PlantService from "@/services/PlantService";

// Importing the new custom components
import OverviewHeader from "@/components/Overview/OverviewHeader.vue";
import ItemsOverview from "@/components/Overview/ItemsOverview.vue";

export default defineComponent({
  name: "PlantOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      plants: [] as Plant[],
      showPublic: "private",
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
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
    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchPlants(); // Refetch plants based on segment change
    },
    navigateToPlant(id: number) {
      this.$router.push({ name: "plant", params: { id } });
    },
    navigateToPlantAdding() {
      this.$router.push({ name: "plant-adding" });
    },
  },
});
</script>
