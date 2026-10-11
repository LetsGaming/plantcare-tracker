<template>
  <ion-page>
    <overview-header
      :title="t('plants.title')"
      :segments="[
        { value: 'public', label: t('segment.public'), icon: icons.segmentPublic },
        {
          value: 'private',
          label: t('segment.private'),
          icon: icons.segmentPrivate,
          hideFromGuests: true,
        },
      ]"
      :addIcon="icons.add"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      :items="overviewItems"
      kind="plant"
      :is-loading="isLoadingList"
      :has-error="hasError"
      :empty-title="emptyTitle"
      :empty-message="emptyMessage"
      :empty-action-label="emptyActionLabel"
      @item-click="navigateToPlant"
      @refresh-items="refreshPlants"
      @retry="refreshPlants"
      @empty-action="openAddModal"
    >
      <template #filters>
        <ion-button v-if="showRoundButton" class="round-button" color="primary" @click="openRound">
          <ion-icon slot="start" :icon="icons.water" aria-hidden="true" />
          {{ t("plants.water_round") }}
        </ion-button>
      </template>
    </items-overview>

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
import { IonButton, IonIcon, IonPage } from "@ionic/vue";
import { icons } from "@/theme/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";

import { mapActions, mapState } from "pinia";
import { usePlantsStore } from "@/stores/plants";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import { useWateringStore } from "@/stores/watering";
import { relativeDaysText, wateringStatus } from "@/utils/wateringStats";
import type { OverviewItem } from "@/components/overview/ItemsOverview.vue";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "PlantOverview",
  components: {
    IonButton,
    IonIcon,
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
    };
  },

  setup() {
    return { icons };
  },

  async ionViewWillEnter() {
    await this.fetchPlants();
  },

  computed: {
    ...mapState(usePlantsStore, ["publicPlants", "personalPlants", "status"]),
    ...mapState(useSessionStore, ["isGuest"]),
    ...mapState(useWateringStore, ["byPlantId"]),
    ...mapState(useSubstratesStore, { substrates: "items" }),
    isPublic() {
      return this.showPublic === "public";
    },
    isLoadingList(): boolean {
      return this.status === "loading" || this.status === "idle";
    },
    hasError(): boolean {
      return this.status === "error";
    },
    emptyTitle(): string {
      return this.t(this.isPublic ? "state.empty_plants_public_title" : "state.empty_plants_title");
    },
    emptyMessage(): string {
      if (this.isGuest) return this.t("state.guest_hint");
      return this.t(
        this.isPublic ? "state.empty_plants_public_message" : "state.empty_plants_message",
      );
    },
    showRoundButton(): boolean {
      return !this.isPublic && !this.isGuest && this.personalPlants.length > 0;
    },
    emptyActionLabel(): string {
      return !this.isGuest && !this.isPublic ? this.t("state.empty_plants_action") : "";
    },
    /** The segment's plants; the store repaints this on every change, optimistic ones included. */
    plants(): Plant[] {
      return this.isPublic ? this.publicPlants : this.personalPlants;
    },
    /** Personal plants carry their watering state; public ones stay plain (other owners' records are not available). */
    overviewItems(): OverviewItem[] {
      const unknownSpecies = this.t("plant.species_unknown");
      const labelled = this.plants.map((plant): OverviewItem => ({
        ...plant,
        description: plant.species || unknownSpecies,
      }));
      if (this.isPublic) return labelled;
      const now = Date.now();
      const locale = localizationService.getLocale();
      return labelled.map((plant): OverviewItem => {
        const records = this.byPlantId[plant.id as number];
        if (!records) return plant;
        const status = wateringStatus(records, now);
        const statusLine =
          status.daysSince === null
            ? this.t("plantlist.never")
            : this.t("plantlist.watered", {
                when: relativeDaysText(status.daysSince, locale),
              });
        return {
          ...plant,
          statusLine,
          statusTone: status.tone,
          statusLabel: status.tone === "ok" ? undefined : this.t(`plantlist.${status.tone}`),
          sortRank: status.rank,
        };
      });
    },
  },

  watch: {
    plants: {
      immediate: true,
      handler(list: Plant[]) {
        if (this.isPublic) return;
        void this.warmWateringRecords(list.map((plant) => plant.id).filter((id) => id > 0));
      },
    },
  },

  methods: {
    ...mapActions(useWateringStore, { warmWateringRecords: "ensureRecordsFor" }),

    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    ...mapActions(useSubstratesStore, { ensureSubstratesLoaded: "ensureLoaded" }),
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

        if (isRefresh) {
          ToastService.showSuccess({
            key: "plants.updated",
            vars: { type: typeLabel },
            fallback: `${typeLabel} plants updated.`,
          });
        }
      } catch (error) {
        // handleRequest has already shown the error toast.
        console.error("Plant fetch error:", error);
      }
    },

    async fetchPlants() {
      await this.loadPlants();
    },

    async refreshPlants() {
      await this.loadPlants(true);
    },

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchPlants();
    },

    openRound() {
      this.$router.push("/tabs/plants/water");
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
      try {
        await this.ensureSubstratesLoaded();
      } catch (e) {
        console.error("Failed to fetch substrates", e);
      }
    },

    closeAddModal() {
      this.showAddingModal = false;
    },

    async addPlant(plantData: AddPlant) {
      if (!plantData.name.trim()) {
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
          try {
            await this.uploadPlantImage(plant.id, plantData.image);
            ToastService.showSuccess({
              key: "plant.add.upload_success",
              fallback: "Image uploaded successfully.",
            });
          } catch (error) {
            console.error("Plant image upload failed:", error);
            ToastService.showWarning({ key: "shell.photo_failed_plant" });
          }
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

<style scoped>
.round-button {
  min-height: var(--tap-min);
  width: 100%;
  margin: 0;
}

@media (min-width: 768px) {
  .round-button {
    width: auto;
    min-width: 240px;
    align-self: flex-start;
  }
}
</style>
