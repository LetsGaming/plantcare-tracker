<template>
  <ul class="legend" :aria-label="t('calendar.legend.title', 'Legend')">
    <li v-for="item in legendItems" :key="item.label" class="legend-item">
      <span
        class="swatch"
        :class="`swatch-${item.shape ?? 'fill'}`"
        :style="{ '--swatch': item.color }"
        aria-hidden="true"
      />
      <span>{{ t(item.label, item.label) }}</span>
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "CalendarLegend",
  props: {
    legendItems: {
      type: Array as PropType<
        { label: string; color: string; shape?: "fill" | "ring" | "today" }[]
      >,
      required: true,
    },
  },
  methods: {
    t(key: string, fallback: string) {
      return localizationService.t(key, undefined, fallback);
    },
  },
});
</script>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
  margin: var(--space-3) 0 0;
  padding: 0;
  list-style: none;
  font-size: var(--text-sm);
  color: var(--ion-text-color);
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.swatch {
  flex: none;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
}

.swatch-fill {
  border-radius: 50%;
  background: var(--swatch);
}

.swatch-ring {
  border-radius: 50%;
  border: 3px solid var(--swatch);
}

.swatch-today {
  border-radius: var(--radius-sm);
  box-shadow: inset 0 0 0 2px var(--swatch);
}
</style>
