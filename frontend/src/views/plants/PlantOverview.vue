<template>
  <ion-page>
    <overview-header
      :title="t('plants.title')"
      :segments="[
        { value: 'public', label: t('segment.public'), icon: peopleCircle },
        {
          value: 'private',
          label: t('segment.private'),
          icon: personCircle,
          hideFromGuests: true,
        },
      ]"
      :addIcon="addCircle"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      :items="plants"
      @item-click="navigateToPlant"
      @refresh-items="refreshPlants"
    />

    <plant-adding-modal
      :isOpen="showAddingModal"
      :isLoading="isAddingLoading"
      :substrates="substrates"
      @save="addPlant"
      @close="closeAddModal"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";

import PlantService from "@/services/PlantService";
import SubstrateService from "@/services/SubstrateService";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PlantOverview",
  components: {
    IonPage,
    OverviewHeader,
    ItemsOverview,
    PlantAddingModal,
  },

  data() {
    return {
      plants: [] as Plant[],
      showPublic: "private",
      showAddingModal: false,
      isAddingLoading: false,
      substrates: [] as Substrate[],
    };
  },

  setup() {
    return { peopleCircle, personCircle, addCircle };
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
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    /* -------------------- PLANTS -------------------- */
    async loadPlants(isRefresh = false) {
      const typeLabel = this.isPublic
        ? this.t("plants.type_public")
        : this.t("plants.type_private");

      try {
        const data = this.isPublic
          ? await PlantService.getPublicPlants(isRefresh)
          : await PlantService.getPersonalPlants(isRefresh);

        this.plants = data || [];

        if (this.plants.length === 0) {
          this.showWarning();
        } else if (isRefresh) {
          ToastService.showSuccess({
            key: "plants.updated",
            vars: { type: typeLabel },
            fallback: `${typeLabel} plants updated.`,
          });
        }
      } catch (error) {
        this.plants = [];
        ToastService.showError({
          key: "plants.update_failed",
          vars: { type: typeLabel },
          fallback: `Failed to load ${typeLabel} plants.`,
        });
        console.error("Plant fetch error:", error);
      }
    },

    async fetchPlants() {
      await this.loadPlants();
    },

    async refreshPlants() {
      await this.loadPlants(true);
    },

    showWarning() {
      const key = this.isPublic
        ? "plants.no_public_available"
        : "plants.no_personal_found";
      ToastService.showWarning(this.t(key));
    },

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchPlants();
    },

    navigateToPlant(id: number) {
      this.$router.push({
        name: "plant-details",
        params: { id, public: this.isPublic ? 1 : 0 },
      });
    },

    /* -------------------- ADD PLANT -------------------- */
    async openAddModal() {
      this.showAddingModal = true;
      if (this.substrates.length === 0) {
        try {
          this.substrates = await SubstrateService.getAllSubstrates();
        } catch (e) {
          console.error("Failed to fetch substrates", e);
        }
      }
    },

    closeAddModal() {
      this.showAddingModal = false;
    },

    async addPlant(plantData: AddPlant) {
      if (
        !plantData.name.trim() ||
        !plantData.species.trim() ||
        plantData.substrateId === 0
      ) {
        ToastService.showError({
          key: "plant.add.error_required",
          fallback: "Please fill in all required fields.",
        });
        return;
      }

      try {
        this.isAddingLoading = true;

        const response = await PlantService.addPlant(plantData);
        if (!response) return;

        if (plantData.image) {
          await PlantService.uploadPlantImage(
            response.plantId,
            plantData.image,
          );
          ToastService.showSuccess({
            key: "plant.add.upload_success",
            fallback: "Image uploaded successfully.",
          });
        }

        this.isAddingLoading = false;
        this.closeAddModal();
        await this.fetchPlants();
      } catch (error) {
        this.isAddingLoading = false;
        ToastService.showError({
          key: "plant.add.error_failed",
          fallback: "Failed to add plant.",
        });
        console.error("Add plant failed:", error);
      } finally {
        this.isAddingLoading = false;
      }
    },
  },
});
</script>
