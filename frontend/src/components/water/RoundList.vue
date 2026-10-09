<template>
  <ul class="round-list">
    <li v-for="row in rows" :key="row.plantId" class="round-row" :class="{ ticked: row.checked }">
      <label class="tick">
        <input
          type="checkbox"
          class="tick-box"
          :checked="row.checked"
          @change="$emit('toggle', row.plantId)"
        />
        <span class="thumb" aria-hidden="true">
          <img v-if="row.imageUrl" :src="row.imageUrl" alt="" loading="lazy" />
          <ion-icon v-else :icon="leaf" />
        </span>
        <span class="text">
          <span class="name break-words">{{ row.name }}</span>
          <span v-if="row.tone !== 'ok'" class="chip" :class="`tone-${row.tone}`">
            {{ t(`plantlist.${row.tone}`) }}
          </span>
        </span>
      </label>
      <ion-select
        v-if="fertilizerTypes.length"
        class="fertilizer"
        interface="popover"
        :value="selectValue(row)"
        :aria-label="t('water.row_fertilizer', { name: row.name })"
        @ionChange="onSelect(row.plantId, $event)"
      >
        <ion-select-option value="default">{{
          t("water.fertilizer_round_default")
        }}</ion-select-option>
        <ion-select-option value="none">{{ t("water.fertilizer_none") }}</ion-select-option>
        <ion-select-option v-for="type in fertilizerTypes" :key="type.id" :value="type.id">
          {{ type.name }}
        </ion-select-option>
      </ion-select>
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonIcon, IonSelect, IonSelectOption } from "@ionic/vue";
import { leaf } from "ionicons/icons";
import localizationService from "@/services/general/LocalizationService";
import type { RoundRow } from "@/utils/waterRound";

export default defineComponent({
  name: "RoundList",
  components: { IonIcon, IonSelect, IonSelectOption },
  props: {
    rows: { type: Array as PropType<RoundRow[]>, required: true },
    fertilizerTypes: { type: Array as PropType<FertilizerType[]>, default: () => [] },
  },
  emits: ["toggle", "set-fertilizer"],
  setup() {
    return { leaf };
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    selectValue(row: RoundRow): string | number {
      if (row.fertilizerTypeId === undefined) return "default";
      return row.fertilizerTypeId === null ? "none" : row.fertilizerTypeId;
    },
    onSelect(plantId: number, event: CustomEvent<{ value: string | number }>) {
      const { value } = event.detail;
      const fertilizer = value === "default" ? undefined : value === "none" ? null : Number(value);
      this.$emit("set-fertilizer", plantId, fertilizer);
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

.round-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 64px;
  padding: var(--space-2) var(--space-4);
  border-bottom: 1px solid var(--ion-border-color);
}

.tick {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  min-height: 48px;
  cursor: pointer;
}

.tick-box {
  width: 24px;
  height: 24px;
  flex: none;
  accent-color: var(--ion-color-primary);
}

.thumb {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  color: var(--ink-soft);
}

.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-1);
  min-width: 0;
}

.name {
  font-weight: 600;
}

.chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 700;
}

.chip.tone-due {
  background: var(--ion-color-tertiary);
  color: var(--ion-color-tertiary-contrast);
}

.chip.tone-overdue {
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
}

.fertilizer {
  flex: none;
  max-width: 40%;
  min-height: 48px;
  font-size: var(--text-sm);
}
</style>
