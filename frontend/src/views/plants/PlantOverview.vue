<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <overview-header
      title="Pflanzen"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        {
          value: 'private',
          label: 'Persönlich',
          icon: personCircle,
          hideFromGuests: true,
        },
      ]"
      :addIcon="addCircle"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="showAddingModal = true"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview :items="plants" @item-click="navigateToPlant" />
      <plant-adding-modal
        :is-open="showAddingModal"
        @close="showAddingModal = false"
        @added="handlePlantAdded"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import PlantService from "@/services/PlantService";

// Importing the new custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";

export default defineComponent({
  name: "PlantOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
    PlantAddingModal,
  },
  data() {
    return {
      plants: [] as Plant[],
      showPublic: "private",
      showAddingModal: false,
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
    };
  },
  async ionViewWillEnter() {
    await this.fetchPlants();
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
    async handlePlantAdded() {
      this.showAddingModal = false;
      await this.fetchPlants();
    },
    navigateToPlant(id: number) {
      const isPublic_Int = this.isPublic ? 1 : 0;
      this.$router.push({
        name: "plant",
        params: { id: id, public: isPublic_Int },
      });
    },
  },
});
</script>
