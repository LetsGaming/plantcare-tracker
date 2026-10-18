<template>
  <div class="round-window">
    <ul class="round-list">
      <round-row
        v-for="row in mountedRows"
        :key="row.plantId"
        :plant-id="row.plantId"
        :name="row.name"
        :image="row.image"
        :tone="row.tone"
        :checked="checkedIds.has(row.plantId)"
        :has-override="overrides.has(row.plantId)"
        :override-id="overrides.get(row.plantId) ?? null"
        :fertilizer-types="fertilizerTypes"
        @toggle="onToggle"
        @set-fertilizer="onSetFertilizer"
      />
    </ul>
    <ion-infinite-scroll :disabled="!canGrow" @ionInfinite="onInfinite">
      <ion-infinite-scroll-content :loading-text="t('list.loading_more')" />
    </ion-infinite-scroll>
  </div>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonInfiniteScroll, IonInfiniteScrollContent } from "@ionic/vue";
import localizationService from "@/services/general/LocalizationService";
import RoundRow from "@/components/water/RoundRow.vue";
import type { FertilizerOverrides, RoundRow as RoundRowData } from "@/utils/waterRound";

export const ROUND_WINDOW = 40;

export default defineComponent({
  name: "RoundList",
  components: { RoundRow, IonInfiniteScroll, IonInfiniteScrollContent },
  props: {
    rows: { type: Array as PropType<readonly RoundRowData[]>, required: true },
    checkedIds: { type: Object as PropType<ReadonlySet<number>>, required: true },
    overrides: { type: Object as PropType<FertilizerOverrides>, required: true },
    fertilizerTypes: { type: Array as PropType<readonly FertilizerType[]>, default: () => [] },
  },
  emits: ["toggle", "set-fertilizer"],
  data() {
    return { windowSize: ROUND_WINDOW };
  },
  computed: {
    mountedRows(): readonly RoundRowData[] {
      return this.rows.length > this.windowSize ? this.rows.slice(0, this.windowSize) : this.rows;
    },
    canGrow(): boolean {
      return this.windowSize < this.rows.length;
    },
  },
  watch: {
    "rows.length"() {
      this.windowSize = ROUND_WINDOW;
    },
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
    onInfinite(event: CustomEvent) {
      this.windowSize += ROUND_WINDOW;
      (event.target as unknown as { complete(): void }).complete();
    },
    onToggle(plantId: number) {
      this.$emit("toggle", plantId);
    },
    onSetFertilizer(plantId: number, fertilizerTypeId: number | null | undefined) {
      this.$emit("set-fertilizer", plantId, fertilizerTypeId);
    },
  },
});
</script>

<style scoped>
.round-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
