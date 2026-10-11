<template>
  <div
    class="placeholder"
    :style="{ '--tint-bg': `var(--tint-${tint})` }"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <svg viewBox="0 0 120 120" class="glyph" aria-hidden="true" focusable="false">
      <component :is="art" :shape="shape" />
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import ComponentArt from "./placeholder-art/ComponentArt.vue";
import PlantArt from "./placeholder-art/PlantArt.vue";
import SaleArt from "./placeholder-art/SaleArt.vue";
import SubstrateArt from "./placeholder-art/SubstrateArt.vue";

export type PlaceholderKind = "plant" | "substrate" | "component" | "sale";

const ART = { plant: PlantArt, substrate: SubstrateArt, component: ComponentArt, sale: SaleArt };

const hash = (value: string): number => {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
};

/**
 * Authored botanical illustrations on a seed-keyed tint,
 * so every item without a photo looks deliberate and distinct.
 */
export default defineComponent({
  name: "PlantPlaceholder",

  components: { ComponentArt, PlantArt, SaleArt, SubstrateArt },

  props: {
    kind: { type: String as PropType<PlaceholderKind>, default: "plant" },
    seed: { type: String, default: "" },
    label: { type: String, default: "" },
  },

  computed: {
    art() {
      return ART[this.kind] ?? PlantArt;
    },
    h(): number {
      return hash(`${this.kind}:${this.seed}`);
    },
    tint(): number {
      return (this.h % 5) + 1;
    },
    /** Which of the three drawings to show; applies to every kind. */
    shape(): number {
      return Math.floor(this.h / 5) % 3;
    },
  },
});
</script>

<style scoped>
.placeholder {
  width: 100%;
  height: 100%;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--tint-bg);
  color: var(--tint-ink);
}

.glyph {
  width: min(62%, 160px);
  height: auto;
  overflow: visible;
}

.glyph :deep(.line) {
  fill: none;
  stroke: var(--ion-color-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.glyph :deep(.fill-soft) {
  fill: rgba(var(--ion-color-primary-rgb), 0.16);
}

.glyph :deep(.fill-clay) {
  fill: rgba(var(--ion-color-secondary-rgb), 0.28);
  stroke: var(--ion-color-secondary);
}

.glyph :deep(.dot) {
  fill: var(--ion-color-secondary);
}

/* Inner leaf detail: thinner and softer than outlines so leaves read calm, not busy. */
.glyph :deep(.vein) {
  fill: none;
  stroke: var(--ion-color-primary);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.6;
}

.glyph :deep(.vein-clay) {
  stroke: var(--ion-color-secondary);
}

/* Finer outline for small pieces (perlite, pebbles, % signs). */
.glyph :deep(.thin) {
  stroke-width: 2;
}

/* Tool handles: a thick clay stroke with a thin groove drawn on top. */
.glyph :deep(.handle) {
  stroke: var(--ion-color-secondary);
  stroke-width: 7;
}

.glyph :deep(.handle-groove) {
  stroke: var(--tint-bg);
  stroke-width: 2;
}

/* Glass highlight on the jar. */
.glyph :deep(.shine) {
  stroke: #fff;
  opacity: 0.9;
}

/* Monstera splits: the tint-filled wedge erases the leaf edge, the open stroke outlines the split. */
.glyph :deep(.cut) {
  fill: var(--tint-bg);
}

.glyph :deep(.slit) {
  stroke-width: 2.5;
}

/* Holes are filled with the actual background tint, so they read as cut-outs on every tint. */
.glyph :deep(.hole) {
  fill: var(--tint-bg);
  stroke-width: 2.5;
}
</style>
