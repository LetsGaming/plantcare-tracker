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

    <items-overview :items="plants" @item-click="navigateToPlant" @refresh-items="refreshPlants"/>
    <plant-adding-modal
      :is-open="showAddingModal"
      @close="showAddingModal = false"
      @added="handlePlantAdded"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import PlantService from "@/services/PlantService";

// Importing the new custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";
import ToastService from "@/services/general/ToastService";

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
        if (this.plants.length === 0) {
          this.showError();
        }
      } catch (error) {
        ToastService.showError(
          this.isPublic
            ? "Fehler beim Abrufen öffentlicher Pflanzen."
            : "Fehler beim Abrufen persönlicher Pflanzen."
        );
        console.error("Error fetching plants:", error);
      }
    },
    async refreshPlants() {
      try {
        this.plants = await PlantService.getPlants(this.isPublic, true);
        if (this.plants.length === 0) {
          this.showError();
        } else {
          ToastService.showSuccess(
            this.isPublic
              ? "Öffentliche Pflanzen aktualisiert."
              : "Persönliche Pflanzen aktualisiert."
          );
        }
      } catch (error) {
        ToastService.showError(
          this.isPublic
            ? "Fehler beim Aktualisieren öffentlicher Pflanzen."
            : "Fehler beim Aktualisieren persönlicher Pflanzen."
        );
        console.error("Error refreshing plants:", error);
      }
    },
    showError() {
      ToastService.showError(
        this.isPublic
          ? "Öffentliche Pflanzen sind nicht verfügbar."
          : "Keine persönlichen Pflanzen gefunden."
      );
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
        name: "plant-details",
        params: { id: id, public: isPublic_Int },
      });
    },
  },
});
</script>
