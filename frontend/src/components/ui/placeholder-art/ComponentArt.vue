<template>
  <!-- Component 0: bark, pumice and a clay pellet -->
  <template v-if="shape === 0">
    <path d="M17 58 L25 43 L48 32 L56 37 L51 51 L31 65 L20 67 Z" class="line fill-clay" />
    <path d="M25 55 L43 40 M30 61 L49 48" class="vein vein-clay" />
    <path d="M44 85 L47 74 L57 68 L70 72 L78 83 L71 94 L55 96 L46 91 Z" class="line fill-soft" />
    <circle cx="58" cy="81" r="2" class="dot" />
    <circle cx="68" cy="86" r="1.5" class="dot" />
    <circle cx="54" cy="90" r="1.5" class="dot" />
    <circle cx="83" cy="49" r="14" class="line fill-clay" />
    <circle cx="79" cy="45" r="2" class="dot" />
    <circle cx="88" cy="52" r="2.5" class="dot" />
    <circle cx="81" cy="56" r="1.5" class="dot" />
    <path d="M20 82 l7 -4 6 5 -4 7 -8 -1 Z" class="line fill-clay" />
    <circle cx="91" cy="80" r="4" class="line fill-soft" />
  </template>

  <!-- Component 1: wooden scoop heaped with perlite -->
  <template v-else-if="shape === 1">
    <path d="M84 70 L106 56" class="line handle" />
    <path d="M84 70 L106 56" class="line handle-groove" />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(40 62) rotate(10) scale(1)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(52 56) rotate(-20) scale(1.1)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(64 58) rotate(30) scale(1)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(74 63) rotate(0) scale(0.9)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(46 52) rotate(40) scale(0.8)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(60 48) rotate(-10) scale(0.9)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(70 52) rotate(20) scale(0.8)"
      class="line fill-soft thin"
    />
    <path d="M24 64 H88 Q86 92 56 92 Q26 92 24 64 Z" class="line fill-clay" />
    <path d="M32 74 Q56 80 80 74" class="vein vein-clay" />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(30 102) rotate(15) scale(0.8)"
      class="line fill-soft thin"
    />
    <path
      d="M-5 -1 Q-5 -6 0 -6 Q6 -6 6 0 Q6 5 0 5 Q-5 5 -5 -1 Z"
      transform="translate(44 106) rotate(-30) scale(0.7)"
      class="line fill-soft thin"
    />
    <circle cx="80" cy="102" r="1.6" class="dot" />
    <circle cx="90" cy="96" r="1.3" class="dot" />
  </template>

  <!-- Component 2: sphagnum moss tuft with pebbles -->
  <template v-else>
    <path
      d="M24 86 Q18 74 28 68 Q28 54 42 54 Q48 42 62 46 Q74 40 82 52 Q96 52 96 66 Q104 76 94 86 Z"
      class="line fill-soft"
    />
    <path
      d="M34 66 q4 -6 8 0 q4 6 8 0 M56 58 q4 -6 8 0 q4 6 8 0 M44 76 q4 -6 8 0 q4 6 8 0 M70 72 q4 -6 8 0 q4 6 8 0"
      class="vein"
    />
    <path
      d="M34 54 l-3 -7 M34 54 l2 -8 M58 45 l-2 -8 M58 45 l3 -7 M84 52 l-1 -8 M84 52 l4 -6"
      class="line"
    />
    <circle cx="31" cy="47" r="1.8" class="dot" />
    <circle cx="61" cy="38" r="1.8" class="dot" />
    <circle cx="88" cy="46" r="1.8" class="dot" />
    <path d="M20 86 H100" class="line" />
    <path
      d="M30 100 Q30 92 40 92 Q50 92 50 100 Q50 106 40 106 Q30 106 30 100 Z"
      class="line fill-clay"
    />
    <path
      d="M70 102 Q70 96 77 96 Q84 96 84 102 Q84 106 77 106 Q70 106 70 102 Z"
      class="line fill-clay"
    />
    <circle cx="60" cy="100" r="1.6" class="dot" />
    <circle cx="92" cy="98" r="1.3" class="dot" />
  </template>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/** The three component drawings; styled by the parent PlantPlaceholder. */
export default defineComponent({
  name: "ComponentArt",
  props: {
    shape: { type: Number, default: 0 },
  },
});
</script>
