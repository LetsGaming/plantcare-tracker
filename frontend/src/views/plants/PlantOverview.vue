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

    <items-overview
      :items="plants"
      @item-click="navigateToPlant"
      @refresh-items="refreshPlants"
    />
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
    /**
     * Core logic for fetching/refreshing plants
     * @param isRefresh - Whether to force a background refresh and show success toast
     */
    async loadPlants(isRefresh = false) {
      const typeLabel = this.isPublic ? "öffentlicher" : "persönlicher";
      const successLabel = this.isPublic ? "Öffentliche" : "Persönliche";

      try {
        this.plants = await PlantService.getPlants(this.isPublic, isRefresh);

        if (this.plants.length === 0) {
          this.showWarning();
        } else if (isRefresh) {
          ToastService.showSuccess(`${successLabel} Pflanzen aktualisiert.`);
        }
      } catch (error) {
        const action = isRefresh ? "Aktualisieren" : "Abrufen";
        ToastService.showError(`Fehler beim ${action} ${typeLabel} Pflanzen.`);
        console.error(
          `Error ${isRefresh ? "refreshing" : "fetching"} plants:`,
          error
        );
      }
    },

    // Specific wrappers for clarity in templates
    async fetchPlants() {
      await this.loadPlants(false);
    },
    async refreshPlants() {
      await this.loadPlants(true);
    },

    showWarning() {
      const message = this.isPublic
        ? "Öffentliche Pflanzen sind nicht verfügbar."
        : "Keine persönlichen Pflanzen gefunden.";
      ToastService.showWarning(message);
    },

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchPlants();
    },

    async handlePlantAdded() {
      this.showAddingModal = false;
      await this.fetchPlants();
    },

    navigateToPlant(id: number) {
      this.$router.push({
        name: "plant-details",
        params: {
          id,
          public: this.isPublic ? 1 : 0,
        },
      });
    },
  },
});
</script>
