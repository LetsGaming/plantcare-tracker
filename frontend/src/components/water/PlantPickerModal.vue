<template>
  <ion-modal
    v-if="mounted"
    :is-open="isOpen"
    :aria-label="t('water.picker_title')"
    @didDismiss="onDismiss"
  >
    <modal-header :header-title="t('water.picker_title')" @close="$emit('close')" />
    <ion-content>
      <search-bar :placeholder="t('water.search')" @search="onSearch" />
      <ul class="plants">
        <li v-for="plant in shown" :key="plant.plantId">
          <button type="button" class="plant" @click="$emit('pick', plant.plantId)">
            <span class="thumb" aria-hidden="true">
              <progressive-image :image="plant.image" sizes="64px" :seed="String(plant.plantId)" />
            </span>
            <span class="name break-words">{{ plant.name }}</span>
          </button>
        </li>
      </ul>
      <ion-infinite-scroll :disabled="!canGrow" @ionInfinite="onInfinite">
        <ion-infinite-scroll-content :loading-text="t('list.loading_more')" />
      </ion-infinite-scroll>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapState } from "pinia";
import { IonContent, IonInfiniteScroll, IonInfiniteScrollContent, IonModal } from "@ionic/vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import SearchBar from "@/components/SearchBar.vue";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { usePlantsStore } from "@/stores/plants";
import { compareText } from "@/utils/intlCache";

export const PICKER_WINDOW = 40;

interface PickerPlant {
  readonly plantId: number;
  readonly name: string;
  readonly key: string;
  readonly image: ImageView | null;
}

export default defineComponent({
  name: "PlantPickerModal",
  components: {
    IonContent,
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IonModal,
    ModalHeader,
    ProgressiveImage,
    SearchBar,
  },
  props: {
    isOpen: { type: Boolean, required: true },
  },
  emits: ["close", "pick"],
  setup(props) {
    return useMountWhileOpen(() => props.isOpen);
  },
  data() {
    return { query: "", windowSize: PICKER_WINDOW };
  },
  computed: {
    ...mapState(usePlantsStore, ["personalPlants"]),
    sorted(): PickerPlant[] {
      const compare = compareText();
      return this.personalPlants
        .map((plant) => ({
          plantId: plant.id,
          name: plant.name,
          key: plant.name.toLowerCase(),
          image: plant.cover ?? plant.images?.at(-1) ?? null,
        }))
        .sort((a, b) => compare(a.name, b.name));
    },
    filtered(): PickerPlant[] {
      const needle = this.query.trim().toLowerCase();
      return needle ? this.sorted.filter((plant) => plant.key.includes(needle)) : this.sorted;
    },
    shown(): PickerPlant[] {
      return this.filtered.length > this.windowSize
        ? this.filtered.slice(0, this.windowSize)
        : this.filtered;
    },
    canGrow(): boolean {
      return this.windowSize < this.filtered.length;
    },
  },
  watch: {
    isOpen(open: boolean) {
      if (open) {
        this.query = "";
        this.windowSize = PICKER_WINDOW;
      }
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    onSearch(value: string) {
      this.query = value;
      this.windowSize = PICKER_WINDOW;
    },
    onInfinite(event: CustomEvent) {
      this.windowSize += PICKER_WINDOW;
      (event.target as unknown as { complete(): void }).complete();
    },
    onDismiss() {
      this.release();
      this.$emit("close");
    },
  },
});
</script>

<style scoped>
.plants {
  margin: 0;
  padding: 0;
  list-style: none;
}

.plant {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 64px;
  padding: var(--space-2) var(--space-4);
  border: 0;
  border-bottom: 1px solid var(--ion-border-color);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.thumb {
  display: block;
  width: 44px;
  height: 44px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
}

.name {
  font-weight: 600;
}
</style>
