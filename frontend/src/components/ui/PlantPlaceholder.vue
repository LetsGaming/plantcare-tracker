<template>
  <div
    class="placeholder"
    :style="{ background: `var(--tint-${tint})` }"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  >
    <svg viewBox="0 0 120 120" class="glyph" aria-hidden="true" focusable="false">
      <template v-if="kind === 'substrate'">
        <rect x="26" y="22" width="68" height="82" rx="14" class="line fill-soft" />
        <rect x="26" y="22" width="68" height="14" rx="7" class="line fill-clay" />
        <path d="M27 60h66M27 80h66" class="line" />
        <circle cx="44" cy="70" r="3" class="dot" />
        <circle cx="62" cy="92" r="3" class="dot" />
        <circle cx="76" cy="68" r="3" class="dot" />
        <circle cx="52" cy="48" r="3" class="dot" />
      </template>

      <template v-else-if="kind === 'component'">
        <circle cx="46" cy="70" r="22" class="line fill-soft" />
        <circle cx="82" cy="78" r="16" class="line fill-clay" />
        <circle cx="70" cy="42" r="14" class="line fill-soft" />
        <path d="M38 62l6 6M76 74l5 5M64 38l4 5" class="line" />
      </template>

      <template v-else-if="shape === 0">
        <path
          d="M60 108C60 108 20 84 20 50 20 28 40 16 60 22c20-6 40 6 40 28 0 34-40 58-40 58Z"
          class="line fill-soft"
        />
        <path d="M60 108V32" class="line" />
        <path
          d="M60 52 40 40M60 68 34 54M60 84 42 70M60 52l20-12M60 68l26-14M60 84l18-14"
          class="line"
        />
      </template>

      <template v-else-if="shape === 1">
        <path d="M60 110C58 84 62 52 76 20" class="line" />
        <ellipse
          v-for="leaf in fern"
          :key="leaf.id"
          :cx="leaf.x"
          :cy="leaf.y"
          rx="13"
          ry="5"
          :transform="`rotate(${leaf.r} ${leaf.x} ${leaf.y})`"
          class="line fill-soft"
        />
      </template>

      <template v-else>
        <path d="M60 106C34 96 22 76 26 52c18 4 30 18 34 54Z" class="line fill-soft" />
        <path d="M60 106C86 96 98 76 94 52 76 56 64 70 60 106Z" class="line fill-soft" />
        <path d="M60 100C44 84 42 56 60 22c18 34 16 62 0 78Z" class="line fill-clay" />
      </template>
    </svg>
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";

export type PlaceholderKind = "plant" | "substrate" | "component" | "sale";

const hash = (value: string): number => {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) >>> 0;
  return h;
};

/** Authored botanical glyphs on a tint keyed to the seed, so every item without a photo looks deliberate and distinct. */
export default defineComponent({
  name: "PlantPlaceholder",
  props: {
    kind: { type: String as PropType<PlaceholderKind>, default: "plant" },
    seed: { type: String, default: "" },
    label: { type: String, default: "" },
  },
  computed: {
    h(): number {
      return hash(`${this.kind}:${this.seed}`);
    },
    tint(): number {
      return (this.h % 5) + 1;
    },
    shape(): number {
      return Math.floor(this.h / 5) % 3;
    },
    fern(): { id: number; x: number; y: number; r: number }[] {
      return Array.from({ length: 10 }, (_, i) => {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        return {
          id: i,
          x: 60 + side * 14 + (4 - row) * 3,
          y: 98 - row * 17,
          r: side * (28 + row * 6),
        };
      });
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
  color: var(--tint-ink);
}

.glyph {
  width: min(62%, 160px);
  height: auto;
  overflow: visible;
}

.line {
  fill: none;
  stroke: var(--ion-color-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.fill-soft {
  fill: rgba(var(--ion-color-primary-rgb), 0.16);
}

.fill-clay {
  fill: rgba(var(--ion-color-secondary-rgb), 0.28);
  stroke: var(--ion-color-secondary);
}

.dot {
  fill: var(--ion-color-secondary);
}
</style>
