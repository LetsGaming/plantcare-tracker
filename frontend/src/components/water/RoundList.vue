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
          <plant-placeholder v-else kind="plant" :seed="String(row.plantId)" />
        </span>
        <span class="text">
          <span class="name break-words">{{ row.name }}</span>
          <span v-if="row.tone !== 'ok'" class="tone-chip" :class="`tone-${row.tone}`">
            {{ t(`plantlist.${row.tone}`) }}
          </span>
          <span
            v-if="
              fertilizerTypes.length &&
              row.fertilizerTypeId !== undefined &&
              !openOverride[row.plantId]
            "
            class="override-chip"
          >
            {{ overrideLabel(row) }}
          </span>
        </span>
      </label>
      <template v-if="fertilizerTypes.length">
        <ion-button
          class="override-edit"
          fill="clear"
          size="small"
          :aria-label="t('water.override_edit')"
          @click="toggleEditor(row.plantId)"
        >
          <ion-icon slot="icon-only" :icon="icons.tune" aria-hidden="true" />
        </ion-button>
        <ion-select
          v-if="openOverride[row.plantId]"
          class="fertilizer"
          interface="popover"
          :key="`${row.plantId}-${locale}`"
          :value="selectValue(row)"
          :aria-label="t('water.row_fertilizer', { name: row.name })"
          @ionChange="onSelect(row.plantId, $event)"
        >
          <ion-select-option value="default">{{
            t("water.fertilizer_round_default")
          }}</ion-select-option>
          <ion-select-option value="none">{{ t("water.fertilizer_none") }}</ion-select-option>
          <ion-select-option v-for="type in fertilizerTypes" :key="type.id" :value="type.id">
            {{ fertilizerLabel(type.name) }}
          </ion-select-option>
        </ion-select>
      </template>
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonButton, IonIcon, IonSelect, IonSelectOption } from "@ionic/vue";
import PlantPlaceholder from "@/components/ui/PlantPlaceholder.vue";
import { icons } from "@/theme/icons";
import { fertilizerLabel } from "@/utils/enumLabels";
import localizationService from "@/services/general/LocalizationService";
import type { RoundRow } from "@/utils/waterRound";

export default defineComponent({
  name: "RoundList",
  components: { IonButton, IonIcon, IonSelect, IonSelectOption, PlantPlaceholder },
  props: {
    rows: { type: Array as PropType<RoundRow[]>, required: true },
    fertilizerTypes: { type: Array as PropType<FertilizerType[]>, default: () => [] },
  },
  emits: ["toggle", "set-fertilizer"],
  setup() {
    return { icons };
  },
  data() {
    return { openOverride: {} as Record<number, boolean> };
  },
  computed: {
    locale(): string {
      return localizationService.getLocale();
    },
  },
  methods: {
    fertilizerLabel,
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    toggleEditor(plantId: number) {
      this.openOverride[plantId] = !this.openOverride[plantId];
    },
    overrideLabel(row: RoundRow): string {
      const type = this.fertilizerTypes.find((candidate) => candidate.id === row.fertilizerTypeId);
      return type ? fertilizerLabel(type.name) : this.t("water.fertilizer_none");
    },
    selectValue(row: RoundRow): string | number {
      if (row.fertilizerTypeId === undefined) return "default";
      return row.fertilizerTypeId === null ? "none" : row.fertilizerTypeId;
    },
    onSelect(plantId: number, event: CustomEvent<{ value: string | number }>) {
      const { value } = event.detail;
      const fertilizer = value === "default" ? undefined : value === "none" ? null : Number(value);
      this.openOverride[plantId] = false;
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
  flex-wrap: wrap;
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
  width: 44px;
  height: 44px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
}

.thumb :deep(.placeholder) {
  width: 100%;
  height: 100%;
  min-height: 0;
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
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  font-weight: 600;
}

.fertilizer {
  flex: 1 1 100%;
  min-height: var(--tap-min);
  font-size: var(--text-sm);
}

.override-chip {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
  font-size: var(--text-xs);
  font-weight: 600;
}

.override-edit {
  flex: none;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: 0;
}
</style>
