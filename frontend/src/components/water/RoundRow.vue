<template>
  <li class="round-row" :class="{ ticked: checked }">
    <label class="tick">
      <input type="checkbox" class="tick-box" :checked="checked" @change="onToggle" />
      <span class="thumb" aria-hidden="true">
        <progressive-image :image="image" sizes="64px" :seed="String(plantId)" />
      </span>
      <span class="text">
        <span class="name break-words">{{ name }}</span>
        <span v-if="tone !== 'ok'" class="tone-chip" :class="`tone-${tone}`">
          {{ t(`plantlist.${tone}`) }}
        </span>
        <span v-if="fertilizerTypes.length && hasOverride && !editorOpen" class="override-chip">
          {{ overrideLabel }}
        </span>
      </span>
    </label>
    <template v-if="fertilizerTypes.length">
      <ion-button
        class="override-edit"
        fill="clear"
        size="small"
        :aria-label="t('water.override_edit')"
        @click="toggleEditor"
      >
        <ion-icon slot="icon-only" :icon="icons.tune" aria-hidden="true" />
      </ion-button>
      <ion-select
        v-if="editorOpen"
        :key="locale"
        class="fertilizer"
        interface="popover"
        :value="selectValue"
        :aria-label="t('water.row_fertilizer', { name })"
        @ionChange="onSelect"
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
</template>

<script lang="ts">
import { defineComponent, type PropType } from "vue";
import { IonButton, IonIcon, IonSelect, IonSelectOption } from "@ionic/vue";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import { icons } from "@/theme/icons";
import { fertilizerLabel } from "@/utils/enumLabels";
import localizationService from "@/services/general/LocalizationService";
import type { WateringTone } from "@/utils/wateringStats";

export default defineComponent({
  name: "RoundRow",
  components: { IonButton, IonIcon, IonSelect, IonSelectOption, ProgressiveImage },
  props: {
    plantId: { type: Number, required: true },
    name: { type: String, required: true },
    image: { type: Object as PropType<ImageView | null>, default: null },
    tone: { type: String as PropType<WateringTone>, required: true },
    checked: { type: Boolean, default: false },
    hasOverride: { type: Boolean, default: false },
    /** Only read when `hasOverride`; null means no fertilizer for this plant. */
    overrideId: { type: Number as PropType<number | null>, default: null },
    fertilizerTypes: { type: Array as PropType<readonly FertilizerType[]>, default: () => [] },
  },
  emits: ["toggle", "set-fertilizer"],
  setup() {
    return { icons };
  },
  data() {
    return { editorOpen: false };
  },
  computed: {
    locale(): string {
      return localizationService.getLocale();
    },
    overrideLabel(): string {
      const type = this.fertilizerTypes.find((candidate) => candidate.id === this.overrideId);
      return type ? fertilizerLabel(type.name) : this.t("water.fertilizer_none");
    },
    selectValue(): string | number {
      if (!this.hasOverride) return "default";
      return this.overrideId === null ? "none" : this.overrideId;
    },
  },
  methods: {
    fertilizerLabel,
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    onToggle() {
      this.$emit("toggle", this.plantId);
    },
    toggleEditor() {
      this.editorOpen = !this.editorOpen;
    },
    onSelect(event: CustomEvent<{ value: string | number }>) {
      const { value } = event.detail;
      const fertilizer = value === "default" ? undefined : value === "none" ? null : Number(value);
      this.editorOpen = false;
      this.$emit("set-fertilizer", this.plantId, fertilizer);
    },
  },
});
</script>

<style scoped>
.round-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  min-height: 64px;
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
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
  display: block;
  width: 44px;
  height: 44px;
  flex: none;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
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
