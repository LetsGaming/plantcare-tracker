<template>
  <ul class="grid" role="list">
    <li v-for="(item, index) in items" :key="item.id">
      <overview-card
        :item="item"
        :kind="kind"
        :sizes="sizes"
        :priority="index < priorityCount"
        @select="onSelect"
      />
    </li>
  </ul>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";

import OverviewCard, { type OverviewItem } from "@/components/overview/OverviewCard.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";

/** Two columns of half the viewport up to 640px, then auto-fill columns of 240px to about 360px. */
const CARD_SIZES = "(min-width: 640px) 360px, 50vw";
/** Cards in the first rows load their image eagerly. */
const PRIORITY_COUNT = 4;

/**
 * Takes only primitives and one array, so a re-render of the surrounding overview (scroll button,
 * refresh state, slots, router outlet churn) never reaches the cards.
 */
export default defineComponent({
  name: "ItemsGrid",
  components: { OverviewCard },
  props: {
    items: {
      type: Array as PropType<readonly OverviewItem[]>,
      required: true,
    },
    kind: {
      type: String as PropType<PlaceholderKind>,
      default: "plant",
    },
  },
  emits: ["select"],
  data() {
    return { sizes: CARD_SIZES, priorityCount: PRIORITY_COUNT };
  },
  methods: {
    onSelect(id: OverviewItem["id"]) {
      this.$emit("select", id);
    },
  },
});
</script>

<style scoped>
.grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: var(--space-4);
    width: 100%;
    max-width: 1100px;
    margin-inline: auto;
    justify-content: center;
  }
}

/* content-visibility paints with containment, which would clip the card shadow and hover lift;
   the padding gives them room and the negative margin keeps the grid geometry unchanged.
   The overview clips vertical overflow, so the last row's bleed adds no scroll space. */
.grid > li {
  --bleed-x: var(--space-4);
  --bleed-top: var(--space-4);
  --bleed-bottom: calc(var(--space-4) * 2);
  margin: calc(-1 * var(--bleed-top)) calc(-1 * var(--bleed-x)) calc(-1 * var(--bleed-bottom));
  padding: var(--bleed-top) var(--bleed-x) var(--bleed-bottom);
  content-visibility: auto;
  contain-intrinsic-size: auto 260px;
  pointer-events: none;
}
</style>
