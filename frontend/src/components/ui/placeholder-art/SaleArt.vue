<template>
  <!-- Sale 0: tropical plant with a price tag -->
  <template v-if="shape === 0">
    <path d="M52 79 Q51 53 37 34 M53 68 Q68 49 72 30" class="line" />
    <path d="M38 55 Q19 43 24 23 Q44 24 51 43 Q49 51 38 55 Z" class="line fill-soft" />
    <path d="M29 30 Q39 41 45 49" class="vein" />
    <path d="M54 54 Q51 31 74 20 Q83 40 65 53 Z" class="line fill-soft" />
    <path d="M74 26 L59 47" class="vein" />
    <path d="M53 67 Q66 45 84 53 Q82 72 57 76 Z" class="line fill-soft" />
    <path d="M79 57 L59 70" class="vein" />
    <path d="M27 77 H79 L74 104 Q53 110 32 104 Z" class="line fill-clay" />
    <path d="M25 76 Q53 82 81 76 L79 83 H27 Z" class="line fill-soft" />
    <path d="M68 78 L91 82 L103 98 L86 113 L70 99 Z" class="line fill-clay" />
    <circle cx="80" cy="87" r="2.5" class="line" />
    <circle cx="82.1" cy="96.1" r="2" class="line thin" />
    <circle cx="88.9" cy="102.9" r="2" class="line thin" />
    <path d="M89.8 94.4 L81.2 104.6" class="line thin" />
  </template>

  <!-- Sale 1: succulent with a round tag on a string -->
  <template v-else-if="shape === 1">
    <g transform="translate(58 76) rotate(-62) scale(0.82)">
      <path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" />
      <path d="M0 -4 Q1 -18 0 -32" class="vein" />
    </g>
    <g transform="translate(62 76) rotate(62) scale(0.82)">
      <path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" />
      <path d="M0 -4 Q1 -18 0 -32" class="vein" />
    </g>
    <g transform="translate(59 76) rotate(-28) scale(0.95)">
      <path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-clay" />
      <path d="M0 -4 Q1 -18 0 -32" class="vein vein-clay" />
    </g>
    <g transform="translate(61 76) rotate(28) scale(0.95)">
      <path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" />
      <path d="M0 -4 Q1 -18 0 -32" class="vein" />
    </g>
    <g transform="translate(60 76) rotate(0) scale(1.05)">
      <path d="M0 0 C-12 -6 -13 -24 0 -36 C13 -24 12 -6 0 0 Z" class="line fill-soft" />
      <path d="M0 -4 Q1 -18 0 -32" class="vein" />
    </g>
    <path d="M36 76 H84 L79 104 Q60 109 41 104 Z" class="line fill-clay" />
    <path d="M33 74 H87 V82 H33 Z" class="line fill-soft" />
    <path d="M82 82 Q90 86 92 90" class="vein" />
    <circle cx="96" cy="100" r="12" class="line fill-soft" />
    <circle cx="92" cy="90" r="2" class="line thin" />
    <circle cx="94" cy="99" r="1.7" class="line thin" />
    <circle cx="100" cy="105" r="1.7" class="line thin" />
    <path d="M100.8 97.5 L93.2 106.5" class="line thin" />
  </template>

  <!-- Sale 2: shopping bag with leaves and a starburst badge -->
  <template v-else>
    <g transform="translate(48 52) rotate(-30) scale(0.85)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <g transform="translate(70 52) rotate(25) scale(0.8)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-clay"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" />
    </g>
    <g transform="translate(60 50) rotate(0) scale(0.95)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <path d="M46 50 Q46 34 60 34 Q74 34 74 50" class="line" />
    <path d="M30 48 H90 L94 106 Q94 110 90 110 H30 Q26 110 26 106 Z" class="line fill-clay" />
    <path d="M30 48 L34 58 H86 L90 48" class="vein vein-clay" />
    <circle cx="46" cy="62" r="2" class="dot" />
    <circle cx="74" cy="62" r="2" class="dot" />
    <path
      d="M84 75 L87.2 79 L92.1 77.4 L92.7 82.5 L97.6 83.8 L95.4 88.4 L98.8 92.1 L94.5 94.8 L95.3 99.8 L90.2 99.7 L88.2 104.4 L84 101.5 L79.8 104.4 L77.8 99.7 L72.7 99.8 L73.5 94.8 L69.2 92.1 L72.6 88.4 L70.4 83.8 L75.3 82.5 L75.9 77.4 L80.8 79 Z"
      class="line fill-soft"
    />
    <circle cx="81" cy="87" r="1.7" class="line thin" />
    <circle cx="87" cy="93" r="1.7" class="line thin" />
    <path d="M87.8 85.5 L80.2 94.5" class="line thin" />
  </template>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/** The three sale drawings; styled by the parent PlantPlaceholder. */
export default defineComponent({
  name: "SaleArt",
  props: {
    shape: { type: Number, default: 0 },
  },
});
</script>
