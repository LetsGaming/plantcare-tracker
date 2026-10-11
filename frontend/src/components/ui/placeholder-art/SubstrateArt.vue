<template>
  <!-- Substrate 0: bag of growing medium with a sprout label -->
  <template v-if="shape === 0">
    <path
      d="M35 25 Q60 29 85 25 L91 40 L96 91 Q95 98 87 98 H33 Q25 98 24 91 L29 40 Z"
      class="line fill-soft"
    />
    <path d="M29 40 Q60 47 91 40 L85 25 Q60 29 35 25 Z" class="line fill-clay" />
    <path d="M36 39 Q60 44 84 39" class="vein" />
    <path
      d="M60 78 V60 M60 68 Q47 66 48 54 Q60 54 60 68 M60 64 Q61 49 73 48 Q75 60 60 64"
      class="line"
    />
    <path d="M35 87 L42 84 M52 90 l4 -3 M73 89 l6 -4 M84 82 l3 2" class="vein" />
    <circle cx="43" cy="76" r="1.6" class="dot" />
    <circle cx="78" cy="72" r="1.6" class="dot" />
  </template>

  <!-- Substrate 1: open bag, rolled rim, trowel in the soil -->
  <template v-else-if="shape === 1">
    <path d="M30 44 L34 102 Q60 107 86 102 L90 44 Z" class="line fill-soft" />
    <path d="M32 44 Q40 34 52 38 Q60 30 70 38 Q80 34 88 44 Z" class="line fill-clay" />
    <circle cx="46" cy="40" r="1.5" class="dot" />
    <path d="M80 22 L94 6" class="line handle" />
    <path d="M80 22 L94 6" class="line handle-groove" />
    <path d="M64 40 Q62 26 74 18 L86 26 Q82 40 64 40 Z" class="line fill-soft" />
    <path d="M68 36 L80 24" class="vein" />
    <path d="M27 42 Q60 50 93 42 L91 52 Q60 59 29 52 Z" class="line fill-soft" />
    <rect x="44" y="66" width="32" height="22" rx="5" class="line fill-clay" />
    <path d="M51 74 H69 M54 81 H66" class="vein vein-clay" />
    <path d="M90 104 Q98 96 106 104 Z" class="line fill-clay" />
    <circle cx="98" cy="94" r="1.6" class="dot" />
    <circle cx="22" cy="104" r="1.6" class="dot" />
  </template>

  <!-- Substrate 2: layered aroid mix in a jar -->
  <template v-else>
    <rect x="38" y="16" width="44" height="12" rx="4" class="line fill-clay" />
    <path d="M46 22 H74" class="vein vein-clay" />
    <path
      d="M30 92 Q34 86 48 86 Q60 82 72 86 Q86 86 90 92 V100 Q90 108 82 108 H38 Q30 108 30 100 Z"
      class="fill-soft"
    />
    <path
      d="M30 68 Q44 62 60 66 Q76 70 90 64 V92 Q86 86 72 86 Q60 82 48 86 Q34 86 30 92 Z"
      class="fill-clay"
    />
    <path
      d="M30 68 Q44 62 60 66 Q76 70 90 64 M30 92 Q34 86 48 86 Q60 82 72 86 Q86 86 90 92"
      class="vein"
    />
    <path
      d="M38 74 L48 72 L50 78 L40 80 Z M60 74 L70 76 L66 81 Z M74 78 L84 74 L83 80 Z"
      class="line fill-clay thin"
    />
    <circle cx="40" cy="98" r="3.5" class="line fill-soft thin" />
    <circle cx="52" cy="100" r="3" class="line fill-soft thin" />
    <circle cx="64" cy="97" r="3.5" class="line fill-soft thin" />
    <circle cx="78" cy="100" r="3" class="line fill-soft thin" />
    <circle cx="46" cy="58" r="1.6" class="dot" />
    <circle cx="60" cy="54" r="1.4" class="dot" />
    <circle cx="74" cy="58" r="1.6" class="dot" />
    <path d="M34 46 Q60 40 86 46" class="vein" />
    <path
      d="M38 28 H82 V32 Q90 36 90 46 V100 Q90 108 82 108 H38 Q30 108 30 100 V46 Q30 36 38 32 Z"
      class="line"
    />
    <path d="M36 50 V62" class="vein shine" />
  </template>
</template>

<script lang="ts">
import { defineComponent } from "vue";

/** The three substrate drawings; styled by the parent PlantPlaceholder. */
export default defineComponent({
  name: "SubstrateArt",
  props: {
    shape: { type: Number, default: 0 },
  },
});
</script>
