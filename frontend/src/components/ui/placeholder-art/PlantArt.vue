<template>
  <!-- Plant 0: split-leaf monstera with a new leaf unfurling -->
  <template v-if="shape === 0">
    <g transform="rotate(-14 60 62)">
      <path d="M58 92 Q57 106 46 114" class="line" />
      <path
        d="M60 92 C52 101 31 99 24 82 C16 62 24 36 42 25 C50 20 57 17 62 15 C70 19 85 26 93 39 C103 56 101 81 93 91 C85 100 68 101 60 92 Z"
        class="line fill-soft"
      />
      <path d="M60 90 Q58 56 62 20" class="vein" />
      <!-- Each split: a tint-filled wedge that cuts the edge, then its outline -->
      <path
        d="M17.3 75.8 L22.2 77.1 Q44.7 80.9 45 80 Q45.3 79.1 23.8 70.9 L19 69.6 Z"
        class="cut"
      />
      <path d="M22.2 77.1 Q44.7 80.9 45 80 Q45.3 79.1 23.8 70.9" class="line slit" />
      <path d="M15.3 58.1 L20.2 59.3 Q45.8 63 46 62 Q46.2 61 21.8 52.7 L16.9 51.5 Z" class="cut" />
      <path d="M20.2 59.3 Q45.8 63 46 62 Q46.2 61 21.8 52.7" class="line slit" />
      <path
        d="M23.1 37.6 L27.6 39.9 Q48.6 47.9 49 47 Q49.4 46.1 30.4 34.1 L26 31.9 Z"
        class="cut"
      />
      <path d="M27.6 39.9 Q48.6 47.9 49 47 Q49.4 46.1 30.4 34.1" class="line slit" />
      <path
        d="M103.4 72 L98.5 72.8 Q75.8 79.1 76 80 Q76.2 80.9 99.5 79.2 L104.5 78.3 Z"
        class="cut"
      />
      <path d="M98.5 72.8 Q75.8 79.1 76 80 Q76.2 80.9 99.5 79.2" class="line slit" />
      <path
        d="M104.4 53.9 L99.5 54.6 Q74.8 61 75 62 Q75.2 63 100.5 61.4 L105.5 60.6 Z"
        class="cut"
      />
      <path d="M99.5 54.6 Q74.8 61 75 62 Q75.2 63 100.5 61.4" class="line slit" />
      <path
        d="M95.4 33.1 L90.8 35.1 Q72.6 45.1 73 46 Q73.4 46.9 93.2 40.9 L97.8 39 Z"
        class="cut"
      />
      <path d="M90.8 35.1 Q72.6 45.1 73 46 Q73.4 46.9 93.2 40.9" class="line slit" />
      <ellipse cx="52" cy="71" rx="3.6" ry="2" transform="rotate(30 52 71)" class="line hole" />
      <ellipse cx="68" cy="71" rx="3.6" ry="2" transform="rotate(-30 68 71)" class="line hole" />
      <ellipse cx="53" cy="53" rx="3.4" ry="1.9" transform="rotate(25 53 53)" class="line hole" />
      <ellipse cx="67" cy="53" rx="3.4" ry="1.9" transform="rotate(-25 67 53)" class="line hole" />
    </g>
    <g transform="translate(86 104) rotate(58)">
      <path
        d="M0 0 C-7 1 -11 -6 -10 -12 C-9 -19 -3 -23 0 -27 C3 -23 9 -19 10 -12 C11 -6 7 1 0 0 Z"
        class="line fill-clay"
      />
      <path d="M0 -2 Q1 -12 0 -22" class="vein vein-clay" />
    </g>
  </template>

  <!-- Plant 1: pothos trailing from a hanging pot -->
  <template v-else-if="shape === 1">
    <path d="M60 2 L42 16 M60 2 L78 16" class="vein" />
    <circle cx="60" cy="2" r="2.2" class="dot" />
    <path d="M72 30 C84 38 89 52 81 64 C73 76 74 90 84 103" class="line" />
    <path d="M48 30 C38 40 30 50 31 63" class="line" />
    <g transform="translate(86 48) rotate(100) scale(0.76)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <g transform="translate(77 71) rotate(-125) scale(0.72)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <g transform="translate(77 88) rotate(100) scale(0.64)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <g transform="translate(84 103) rotate(155) scale(0.54)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-clay"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" />
    </g>
    <g transform="translate(37 42) rotate(-110) scale(0.68)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-clay"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein vein-clay" />
    </g>
    <g transform="translate(31 63) rotate(185) scale(0.6)">
      <path
        d="M0 0 C-9 1 -15 -7 -14 -17 C-13 -27 -5 -33 0 -40 C5 -33 13 -27 14 -17 C15 -7 9 1 0 0 Z"
        class="line fill-soft"
      />
      <path d="M0 -2 Q1 -18 0 -33" class="vein" />
    </g>
    <path d="M42 16 H78 L74 31 Q60 36 46 31 Z" class="line fill-clay" />
    <path d="M40 16 H80" class="line" />
  </template>

  <!-- Plant 2: prayer plant in a low bowl -->
  <template v-else>
    <g transform="translate(52 94) rotate(-58) scale(0.8)">
      <path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" />
      <path
        d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52"
        class="vein"
      />
    </g>
    <g transform="translate(68 94) rotate(56) scale(0.8)">
      <path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-clay" />
      <path
        d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52"
        class="vein vein-clay"
      />
    </g>
    <g transform="translate(56 94) rotate(-20) scale(0.95)">
      <path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" />
      <path
        d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52"
        class="vein"
      />
    </g>
    <g transform="translate(64 94) rotate(20) scale(0.92)">
      <path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" />
      <path
        d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52"
        class="vein"
      />
    </g>
    <g transform="translate(60 94) rotate(0) scale(1.02)">
      <path d="M0 0 C-13 -12 -15 -40 0 -64 C15 -40 13 -12 0 0 Z" class="line fill-soft" />
      <path
        d="M0 -4 Q1 -32 0 -58 M-1 -16 L-7 -22 M1 -27 L7 -33 M-1 -38 L-6 -43 M1 -48 L4 -52"
        class="vein"
      />
    </g>
    <path d="M38 92 H82 L77 109 Q60 114 43 109 Z" class="line fill-clay" />
    <path d="M35 92 H85" class="line" />
    <circle cx="52" cy="101" r="1.6" class="dot" />
    <circle cx="66" cy="104" r="1.6" class="dot" />
  </template>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/** The three plant drawings; styled by the parent PlantPlaceholder. */
export default defineComponent({
  name: "PlantArt",
  props: {
    shape: { type: Number, default: 0 },
  },
});
</script>
