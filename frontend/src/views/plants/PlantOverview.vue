<template>
  <ion-page>
    <overview-header
      :title="t('plants.title')"
      :segments="segments"
      :addIcon="icons.add"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      ref="overview"
      :items="overviewItems"
      kind="plant"
      :is-loading="isLoadingList"
      :has-error="hasError"
      :empty-title="emptyTitle"
      :empty-message="emptyMessage"
      :empty-action-label="emptyActionLabel"
      :active="pageActive"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :server-search="isPublic"
      :total="listTotal"
      :list-key="showPublic"
      @item-click="navigateToPlant"
      @refresh-items="refreshItems"
      @retry="refreshItems"
      @empty-action="openAddModal"
      @load-more="loadMoreItems"
      @query-change="changeQuery"
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
      @save="addPlant"
      @close="closeAddModal"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent, toRaw } from "vue";
import { IonButton, IonIcon, IonPage } from "@ionic/vue";
import { icons } from "@/theme/icons";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import PlantAddingModal from "@/components/plants/PlantAddingModal.vue";

import { mapActions, mapState } from "pinia";
import { segmentedList } from "@/utils/segmentedList";
import { usePlantsStore } from "@/stores/plants";
import { useSessionStore } from "@/stores/session";
import { isActive, pageActive } from "@/utils/pageActive";
import { relativeDaysText, wateringStatus } from "@/utils/wateringStats";
import type { OverviewItem } from "@/components/overview/ItemsOverview.vue";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

interface CachedItem {
  stamp: string;
  watering: WateringSummary | null;
  item: OverviewItem;
}

const overviewList = segmentedList<PlantView>({
  useStore: usePlantsStore,
  initialSegment: () => (useSessionStore().isGuest ? "public" : "private"),
  noun: "plants",
  keys: {
    publicSegment: "segment.public",
    privateSegment: "segment.private",
    emptyPublicTitle: "state.empty_plants_public_title",
    emptyPrivateTitle: "state.empty_plants_title",
    emptyPublicMessage: "state.empty_plants_public_message",
    emptyPrivateMessage: "state.empty_plants_message",
    emptyAction: "state.empty_plants_action",
  },
  onRefreshed: (isPublic) => {
    const typeLabel = localizationService.t(
      isPublic ? "plants.type_public" : "plants.type_private",
    );
    ToastService.showSuccess({
      key: "plants.updated",
      vars: { type: typeLabel },
      fallback: `${typeLabel} plants updated.`,
    });
  },
});

const NO_ITEMS: readonly OverviewItem[] = Object.freeze([]);

/** One overview item per plant object and render context, so an unchanged plant keeps its card props. */
const itemCache = new WeakMap<PlantView, CachedItem>();
const lastItems = new WeakMap<object, readonly OverviewItem[]>();
const ownedByList = new WeakMap<object, ReadonlyMap<number, WateringSummary | null>>();

/** The viewer's plants by id, built once per list array. */
const ownedOf = (list: readonly PlantView[]): ReadonlyMap<number, WateringSummary | null> => {
  const key = toRaw(list);
  let owned = ownedByList.get(key);
  if (!owned) {
    owned = new Map(key.map((plant) => [plant.id, plant.watering]));
    ownedByList.set(key, owned);
  }
  return owned;
};

const msUntilNextMidnight = (): number => {
  const now = new Date();
  return (
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1).getTime() -
    now.getTime()
  );
};

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
  mixins: [pageActive, overviewList],

  data() {
    return {
      showAddingModal: false,
      isAddingLoading: false,
      dayTick: 0,
      dayTimer: 0,
    };
  },

  mounted() {
    this.scheduleDayTick();
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  },

  beforeUnmount() {
    window.clearTimeout(this.dayTimer);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  },

  setup() {
    return { icons };
  },

  async ionViewWillEnter() {
    await this.fetchItems();
  },

  computed: {
    ...mapState(useSessionStore, ["userId"]),
    showRoundButton(): boolean {
      return !this.isPublic && !this.isGuest && this.mineList.items.length > 0;
    },
    /**
     * Cards of the segment. The owner's plants carry their watering state, built in O(1) from the
     * summary; a plant of someone else, or an owner plant without a summary yet, shows none. A
     * hidden page keeps its last cards and recomputes once when it is shown again.
     */
    overviewItems(): readonly OverviewItem[] {
      if (!isActive(this)) return lastItems.get(this.$) ?? NO_ITEMS;
      void this.dayTick;
      const now = Date.now();
      const stamp = [
        localizationService.getLocale(),
        new Date(now).toDateString(),
        this.t("plant.species_unknown"),
      ].join("|");
      const owned = this.isPublic ? ownedOf(this.mineList.items) : null;
      const items = this.activeList.items.map((plant) => this.cardFor(plant, stamp, now, owned));
      lastItems.set(this.$, items);
      return items;
    },
  },

  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },

    scheduleDayTick() {
      window.clearTimeout(this.dayTimer);
      this.dayTimer = window.setTimeout(() => {
        this.dayTick++;
        this.scheduleDayTick();
      }, msUntilNextMidnight());
    },

    onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      this.dayTick++;
      this.scheduleDayTick();
    },

    ...mapActions(usePlantsStore, {
      addPlantToStore: "addPlant",
      uploadPlantImage: "uploadPlantImage",
    }),

    /** `owned` maps the viewer's own plants to their summaries; it is only needed in the public segment. */
    cardFor(
      plant: PlantView,
      stamp: string,
      now: number,
      owned: ReadonlyMap<number, WateringSummary | null> | null,
    ): OverviewItem {
      const watering =
        plant.userId === this.userId ? (plant.watering ?? owned?.get(plant.id) ?? null) : null;
      const cached = itemCache.get(plant);
      if (cached && cached.stamp === stamp && cached.watering === watering) return cached.item;

      const item: OverviewItem = {
        id: plant.id,
        name: plant.name,
        description: plant.speciesName ?? this.t("plant.species_unknown"),
        imageUrl: plant.cover?.url,
        image: plant.cover,
        searchText: plant.searchText,
      };
      if (watering) {
        const status = wateringStatus(watering, now);
        item.statusLine =
          status.daysSince === null
            ? this.t("plantlist.never")
            : this.t("plantlist.watered", {
                when: relativeDaysText(status.daysSince, localizationService.getLocale()),
              });
        item.statusTone = status.tone;
        item.statusLabel = status.tone === "ok" ? undefined : this.t(`plantlist.${status.tone}`);
        item.sortRank = status.rank;
      }
      itemCache.set(plant, { stamp, watering, item: Object.freeze(item) });
      return item;
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
    openAddModal() {
      this.showAddingModal = true;
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
        // handleRequest has shown the error toast; the optimistic
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
