<template>
  <ul class="round-list">
    <round-row
      v-for="row in rows"
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
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import RoundRow from "@/components/water/RoundRow.vue";
import type { FertilizerOverrides, RoundRow as RoundRowData } from "@/utils/waterRound";

export default defineComponent({
  name: "RoundList",
  components: { RoundRow },
  props: {
    rows: { type: Array as PropType<readonly RoundRowData[]>, required: true },
    checkedIds: { type: Object as PropType<ReadonlySet<number>>, required: true },
    overrides: { type: Object as PropType<FertilizerOverrides>, required: true },
    fertilizerTypes: { type: Array as PropType<readonly FertilizerType[]>, default: () => [] },
  },
  emits: ["toggle", "set-fertilizer"],
  methods: {
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
