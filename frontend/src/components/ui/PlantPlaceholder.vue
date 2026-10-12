<template>
  <div
    class="placeholder"
    :style="styleVars"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { placeholderArt, placeholderSpec, type PlaceholderKind } from "./placeholderArt";

export type { PlaceholderKind } from "./placeholderArt";

/**
 * One element: seed-keyed tint behind a baked botanical drawing (a cached data-URI SVG per theme),
 * so every item without a photo looks deliberate and distinct. A `color` replaces both with a flat
 * dominant colour for images that are still loading.
 */
export default defineComponent({
  name: "PlantPlaceholder",

  props: {
    kind: { type: String as PropType<PlaceholderKind>, default: "plant" },
    seed: { type: String, default: "" },
    label: { type: String, default: "" },
    color: { type: String, default: "" },
  },

  computed: {
    styleVars(): Record<string, string> {
      if (this.color) return { backgroundColor: this.color, backgroundImage: "none" };
      const { tint, variant } = placeholderSpec(this.kind, this.seed);
      return {
        "--art-light": placeholderArt(this.kind, variant, tint, "light"),
        "--art-dark": placeholderArt(this.kind, variant, tint, "dark"),
        backgroundColor: `var(--tint-${tint})`,
      };
    },
  },
});
</script>

<style scoped>
.placeholder {
  width: 100%;
  height: 100%;
  min-height: 80px;
  background-image: var(--art-light);
  background-repeat: no-repeat;
  background-position: center;
  background-size: min(62%, 160px) auto;
}

:global(.ion-palette-dark) .placeholder {
  background-image: var(--art-dark);
}
</style>
