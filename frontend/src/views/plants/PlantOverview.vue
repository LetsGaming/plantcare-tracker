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

    <items-overview :items="plants" @item-click="navigateToPlant" @refresh-items="refreshPlants" />

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

import { mapActions, mapState } from "pinia";
import { usePlantsStore } from "@/stores/plants";
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
    ...mapState(usePlantsStore, ["publicPlants", "personalPlants"]),
    isPublic() {
      return this.showPublic === "public";
    },
    /** The segment's plants; the store repaints this on every change, optimistic ones included. */
    plants(): Plant[] {
      return this.isPublic ? this.publicPlants : this.personalPlants;
    },
  },

  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    ...mapActions(usePlantsStore, {
      ensureLoaded: "ensureLoaded",
      addPlantToStore: "addPlant",
      uploadPlantImage: "uploadPlantImage",
    }),

    /* -------------------- PLANTS -------------------- */
    async loadPlants(isRefresh = false) {
      const typeLabel = this.isPublic
        ? this.t("plants.type_public")
        : this.t("plants.type_private");

      try {
        await this.ensureLoaded({ force: isRefresh });

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
      const key = this.isPublic ? "plants.no_public_available" : "plants.no_personal_found";
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
      if (!plantData.name.trim() || !plantData.species.trim() || plantData.substrateId === 0) {
        ToastService.showError({
          key: "plant.add.error_required",
          fallback: "Please fill in all required fields.",
        });
        return;
      }

      try {
        this.isAddingLoading = true;

        // Optimistic: the plant is already painted into the store and the
        // list has re-rendered. The resolved value is the reconciled server
        // plant, carrying the real id for the upload.
        const plant = await this.addPlantToStore(plantData);

        if (plantData.image) {
          await this.uploadPlantImage(plant.id, plantData.image);
          ToastService.showSuccess({
            key: "plant.add.upload_success",
            fallback: "Image uploaded successfully.",
          });
        }

        this.closeAddModal();
      } catch (error) {
        // handleRequest has already shown the error toast; the optimistic
        // wrapper has rolled the store back. Keep the modal open for retry.
        console.error("Add plant failed:", error);
      } finally {
        this.isAddingLoading = false;
      }
    },
  },
});
</script>
