<template>
  <ion-content ref="contentRef" :scroll-events="true" @ionScroll="handleScroll($event)">
    <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
      <ion-refresher-content
        :pulling-icon="chevronDown"
        :pulling-text="t('pullToRefresh.pull')"
        refreshing-spinner="circles"
        :refreshing-text="t('pullToRefresh.refreshing')"
      />
    </ion-refresher>

    <ion-fab
      v-if="showScrollTop"
      vertical="bottom"
      horizontal="start"
      slot="fixed"
      class="scroll-top-fab"
    >
      <ion-fab-button
        size="small"
        color="tertiary"
        :aria-label="t('a11y.scroll_top')"
        @click="scrollToTop"
      >
        <ion-icon :icon="arrowUp" aria-hidden="true" />
      </ion-fab-button>
    </ion-fab>

    <div class="overview">
      <div v-if="items.length" class="search-row">
        <search-bar
          ref="search"
          class="search-field"
          :placeholder="t('search.placeholder')"
          @search="filterItems"
        />
        <icon-button
          :icon="refreshIcon"
          :label="t('a11y.refresh')"
          :disabled="isRefreshing"
          class="refresh-action"
          @press="manualRefresh"
        />
      </div>

      <slot name="filters" />

      <div v-if="items.length" class="count-row">
        <p class="count" aria-live="polite">
          {{ filteredItems.length }} {{ t("overview.items") }}
          <strong v-if="newInView > 0" class="count-new">
            {{ t("sales3.new_total", { count: newInView }) }}
          </strong>
        </p>
        <slot name="count-actions" :new-in-view="newInView" :visible-count="filteredItems.length" />
      </div>

      <state-block
        v-if="isLoading && !items.length"
        kind="loading"
        :title="t('state.loading')"
        :skeletons="6"
      />

      <state-block
        v-else-if="hasError && !items.length"
        kind="error"
        :placeholder-kind="kind"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="$emit('retry')"
      />

      <state-block
        v-else-if="!items.length"
        kind="empty"
        :placeholder-kind="kind"
        :title="emptyTitle || t('overview.no_entries')"
        :message="emptyMessage"
        :action-label="emptyActionLabel"
        @action="$emit('empty-action')"
      />

      <state-block
        v-else-if="!filteredItems.length"
        kind="empty"
        :placeholder-kind="kind"
        :title="t('state.no_results_title', { query: currentSearch })"
        :message="t('state.no_results_message')"
        :action-label="t('state.clear_search')"
        @action="clearSearch"
      />

      <ul v-else class="grid" role="list">
        <li v-for="item in filteredItems" :key="item.id">
          <button type="button" class="tag-card" @click="navigateToItem(item.id)">
            <span class="tag-media">
              <progressive-image
                :src="item.imageUrl"
                :alt="item.name"
                :kind="kind"
                :seed="String(item.id)"
              />
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
                <span v-if="item.discountText" class="discount-chip">{{ item.discountText }}</span>
              </span>
              <span v-if="item.description" class="tag-sub break-words">{{
                item.description
              }}</span>
              <span v-if="item.statusLine" class="tag-status">
                <span class="status-line break-words" :class="`tone-${item.statusTone ?? 'ok'}`">{{
                  item.statusLine
                }}</span>
                <span
                  v-if="item.statusLabel"
                  class="status-chip"
                  :class="`tone-${item.statusTone ?? 'ok'}`"
                >
                  <ion-icon
                    :icon="item.statusTone === 'overdue' ? alertCircle : water"
                    aria-hidden="true"
                  />
                  {{ item.statusLabel }}
                </span>
              </span>
            </span>
          </button>
        </li>
      </ul>
    </div>
  </ion-content>
</template>

<script lang="ts">
import { defineComponent, PropType, ref } from "vue";
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonFab,
  IonFabButton,
} from "@ionic/vue";
import { alertCircle, chevronDownCircleOutline, reload, arrowUp, water } from "ionicons/icons";

import SearchBar from "@/components/SearchBar.vue";
import Utils from "@/utils/utils";
import localizationService from "@/services/general/LocalizationService";
import ProgressiveImage from "@/components/ProgressiveImage.vue";
import IconButton from "@/components/ui/IconButton.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";

export interface OverviewItem {
  id: string | number;
  name: string;
  imageUrl?: string;
  description?: string;
  isNew?: boolean;
  /** Watering state shown in the tag body; sortRank orders ascending ahead of unranked items. */
  statusLine?: string;
  statusTone?: "due" | "overdue" | "ok";
  statusLabel?: string;
  sortRank?: number;
  /** Formatted prices of a sale card, shown between the name and the shop line. */
  priceText?: string;
  oldPriceText?: string;
  discountText?: string;
}

export default defineComponent({
  name: "ItemsOverview",
  components: {
    SearchBar,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonIcon,
    IonFab,
    IonFabButton,
    ProgressiveImage,
    IconButton,
    StateBlock,
  },
  props: {
    items: {
      type: Array as PropType<OverviewItem[]>,
      required: true,
    },
    onItemClick: {
      type: Function as PropType<(id: any) => void>,
      required: true,
    },
    onRefreshItems: {
      type: Function as PropType<() => Promise<void>>,
      required: true,
    },
    kind: {
      type: String as PropType<PlaceholderKind>,
      default: "plant",
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    hasError: {
      type: Boolean,
      default: false,
    },
    emptyTitle: {
      type: String,
      default: "",
    },
    emptyMessage: {
      type: String,
      default: "",
    },
    emptyActionLabel: {
      type: String,
      default: "",
    },
    /** The parent already orders the items; keep its order instead of the default one. */
    presorted: {
      type: Boolean,
      default: false,
    },
  },
  emits: ["retry", "empty-action"],
  setup() {
    const contentRef = ref<InstanceType<typeof IonContent> | null>(null);
    return { contentRef };
  },
  data() {
    return {
      currentSearch: "",
      filteredItems: [] as OverviewItem[],
      chevronDown: chevronDownCircleOutline,
      refreshIcon: reload,
      arrowUp: arrowUp,
      alertCircle,
      water,
      isRefreshing: false,
      showScrollTop: false,
    };
  },
  computed: {
    newInView(): number {
      return this.filteredItems.filter((item) => item.isNew).length;
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback || key);
    },
    handleScroll(event: CustomEvent) {
      this.showScrollTop = event.detail.scrollTop > 300;
    },
    async scrollToTop() {
      if (this.contentRef) {
        await this.contentRef.$el.scrollToTop(500);
      }
    },
    handleRefresh(event: any) {
      this.isRefreshing = true;
      this.onRefreshItems().finally(() => {
        event.target.complete();
        this.isRefreshing = false;
      });
    },
    manualRefresh() {
      this.isRefreshing = true;
      this.onRefreshItems().finally(() => {
        this.isRefreshing = false;
      });
    },
    filterItems(query: string) {
      this.currentSearch = query;
      const filtered = Utils.baseSearchFilter(query, this.items);
      this.filteredItems = this.sortItems(filtered);
    },
    clearSearch() {
      (this.$refs.search as InstanceType<typeof SearchBar> | undefined)?.clearSearch();
    },
    sortItems(items: OverviewItem[]) {
      if (this.presorted) return items;
      const locale = localizationService.getLocale();
      return [...items].sort((a, b) => {
        const rankDelta = (a.sortRank ?? 0) - (b.sortRank ?? 0);
        if (rankDelta !== 0) return rankDelta;
        if (a.isNew && !b.isNew) return -1;
        if (!a.isNew && b.isNew) return 1;
        return a.name.localeCompare(b.name, locale);
      });
    },
    navigateToItem(id: number | string) {
      if (typeof id !== "number" && typeof id !== "string") {
        console.warn("Invalid item id type:", id);
        return;
      }
      this.onItemClick(id);
    },
  },
  watch: {
    items: {
      immediate: true,
      handler(newItems: OverviewItem[]) {
        if (this.currentSearch) {
          this.filterItems(this.currentSearch);
        } else {
          this.filteredItems = this.sortItems(newItems);
        }
      },
    },
  },
});
</script>

<style scoped>
ion-content {
  --padding-top: 0;
  --padding-bottom: 0;
  --background: var(--ion-background-color);
}

.scroll-top-fab {
  margin-bottom: var(--space-3);
  margin-inline-start: var(--space-3);
}

.overview {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.search-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.search-field {
  flex: 1;
}

.count-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.count {
  margin: 0;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.count-new {
  margin-inline-start: var(--space-2);
  color: var(--ion-color-secondary-shade);
}

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

.tag-card {
  all: unset;
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
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
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
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
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
  color: var(--ion-color-tertiary-shade);
  font-weight: 600;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: var(--text-xs);
  font-weight: 700;
}

.status-chip.tone-due {
  background: var(--ion-color-tertiary);
  color: var(--ion-color-tertiary-contrast);
}

.status-chip.tone-overdue {
  background: var(--ion-color-secondary);
  color: var(--ion-color-secondary-contrast);
}
</style>
