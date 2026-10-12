<template>
  <div
    class="placeholder"
    :class="artClass"
    :style="flatStyle"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { placeholderClass, placeholderSpec, type PlaceholderKind } from "./placeholderArt";

export type { PlaceholderKind } from "./placeholderArt";

/**
 * One element: seed-keyed tint behind a baked botanical drawing, both held in a shared class
 * (see placeholderClass), so every item without a photo looks deliberate and distinct. A `color`
 * replaces both with a flat dominant colour for images that are still loading.
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
    artClass(): string | undefined {
      if (this.color) return undefined;
      const { tint, variant } = placeholderSpec(this.kind, this.seed);
      return placeholderClass(this.kind, variant, tint);
    },
    flatStyle(): Record<string, string> | undefined {
      return this.color ? { backgroundColor: this.color, backgroundImage: "none" } : undefined;
    },
  },
});
</script>

<style scoped>
.placeholder {
  width: 100%;
  height: 100%;
  min-height: 80px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: min(62%, 160px) auto;
}
</style>
