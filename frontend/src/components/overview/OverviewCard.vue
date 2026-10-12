<template>
  <button type="button" class="tag-card" @click="$emit('select', item.id)">
    <span class="tag-media">
      <progressive-image v-bind="imageProps" alt="" :kind="kind" :seed="String(item.id)" />
      <span v-if="item.isNew" class="new-pill">{{ t("label.new") }}</span>
    </span>
    <span class="tag-body">
      <span class="tag-hole" aria-hidden="true" />
      <span class="tag-name break-words">{{ item.name }}</span>
      <span v-if="item.priceText" class="tag-price">
        <span class="price-now">{{ item.priceText }}</span>
        <span v-if="item.oldPriceText" class="price-old">
          <span class="sr-only">{{ t("sales3.was", { price: item.oldPriceText }) }}</span>
          <s aria-hidden="true">{{ item.oldPriceText }}</s>
        </span>
        <span v-if="item.discountText" class="discount-chip">
          <ion-icon :icon="icons.discount" aria-hidden="true" />
          {{ item.discountText }}
        </span>
      </span>
      <span v-if="item.description" class="tag-sub break-words">{{ item.description }}</span>
      <span v-if="item.statusLine" class="tag-status">
        <span
          v-if="item.statusTone !== 'new'"
          class="status-line break-words"
          :class="`tone-${item.statusTone ?? 'ok'}`"
          >{{ item.statusLine }}</span
        >
        <span
          v-if="item.statusLabel"
          class="status-chip tone-chip"
          :class="`tone-${item.statusTone ?? 'ok'}`"
        >
          <ion-icon
            :icon="item.statusTone === 'overdue' ? icons.alertCircle : icons.water"
            aria-hidden="true"
          />
          {{ item.statusLabel }}
        </span>
      </span>
    </span>
  </button>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonIcon } from "@ionic/vue";
import { alertCircle, water } from "ionicons/icons";

import ProgressiveImage from "@/components/ProgressiveImage.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";
import localizationService from "@/services/general/LocalizationService";
import { icons } from "@/theme/icons";
import type { WateringTone } from "@/utils/wateringStats";

/** Server image of an item; `url` is the 1024 variant, `srcset` lists the smaller ones. */
export interface OverviewImage {
  url: string;
  srcset?: string | null;
  width?: number | null;
  height?: number | null;
  placeholder?: string | null;
}

export interface OverviewItem {
  id: string | number;
  name: string;
  imageUrl?: string;
  /** Preferred over `imageUrl` when present. */
  image?: OverviewImage | null;
  description?: string;
  isNew?: boolean;
  /** Watering state shown in the tag body; sortRank orders ascending ahead of unranked items. */
  statusLine?: string;
  statusTone?: WateringTone;
  statusLabel?: string;
  sortRank?: number;
  /** Formatted prices of a sale card, shown between the name and the shop line. */
  priceText?: string;
  oldPriceText?: string;
  discountText?: string;
  /** Lowercase text the search matches; without it the search matches name and description. */
  searchText?: string;
}

const cardIcons = { discount: icons.discount, alertCircle, water };

export default defineComponent({
  name: "OverviewCard",
  components: { IonIcon, ProgressiveImage },
  props: {
    item: {
      type: Object as PropType<OverviewItem>,
      required: true,
    },
    kind: {
      type: String as PropType<PlaceholderKind>,
      default: "plant",
    },
    /** `sizes` of the card image. */
    sizes: {
      type: String,
      default: "",
    },
    /** Above-the-fold card: load its image eagerly. */
    priority: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["select"],
  data() {
    return { icons: cardIcons };
  },
  computed: {
    imageProps(): Record<string, unknown> {
      const image = this.item.image;
      return {
        src: image?.url ?? this.item.imageUrl,
        image: image ?? null,
        sizes: this.sizes,
        priority: this.priority,
      };
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
  },
});
</script>

<style scoped>
.tag-card {
  all: unset;
  contain: content;
  pointer-events: auto;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  background: var(--surface-raised);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition:
    transform 0.25s var(--ease-out),
    box-shadow 0.25s var(--ease-out);
}

.tag-card:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

@media (hover: hover) {
  .tag-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-lift);
  }
}

.tag-card:active {
  transform: scale(0.985);
}

.tag-media {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}

.new-pill {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--new);
  color: var(--new-ink);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.tag-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-4) var(--space-3) var(--space-3);
  border-top: 2px dashed var(--line);
}

.tag-hole {
  position: absolute;
  top: -7px;
  left: 50%;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  background: var(--surface-sunken);
  box-shadow: inset 0 0 0 1.5px var(--line);
}

.tag-name {
  font-family: var(--font-display);
  font-weight: 650;
  font-size: var(--text-md);
  line-height: 1.2;
  color: var(--ion-text-color);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tag-sub {
  font-size: var(--text-xs);
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tag-price {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 var(--space-2);
  margin-top: 2px;
}

.price-now {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-lg);
  line-height: 1.2;
  color: var(--ion-text-color);
}

.price-old {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.discount-chip {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--surface-sunken);
  color: var(--ion-text-color);
  font-size: var(--text-xs);
  font-weight: 700;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.tag-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin-top: var(--space-1);
}

.status-line {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.status-line.tone-due,
.status-line.tone-overdue {
  font-weight: 600;
}

.status-line.tone-due {
  color: var(--ion-color-tertiary-shade);
}

.status-line.tone-overdue {
  color: var(--overdue-ink);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
