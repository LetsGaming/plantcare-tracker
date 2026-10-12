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
      <div v-if="showSearch" class="search-row">
        <search-bar
          ref="search"
          class="search-field"
          :placeholder="t('search.placeholder')"
          @search="onSearch"
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

      <div v-if="sourceItems.length" class="count-row">
        <p class="count" aria-live="polite">
          {{ itemCount }} {{ t("overview.items") }}
          <strong v-if="showNewCount" class="count-new">
            {{ t("sales3.new_total", { count: newInView }) }}
          </strong>
        </p>
        <slot name="count-actions" :new-in-view="newInView" :visible-count="filteredItems.length" />
      </div>

      <state-block
        v-if="isLoading && !sourceItems.length"
        kind="loading"
        :title="t('state.loading')"
        :skeletons="6"
      />

      <state-block
        v-else-if="hasError && !sourceItems.length"
        kind="error"
        :placeholder-kind="kind"
        :title="t('state.error_title')"
        :message="t('state.error_message')"
        :action-label="t('state.retry')"
        @action="$emit('retry')"
      />

      <state-block
        v-else-if="!sourceItems.length && !trimmedQuery"
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
        :title="t('state.no_results_title', { query })"
        :message="t('state.no_results_message')"
        :action-label="t('state.clear_search')"
        @action="clearSearch"
      />

      <template v-else>
        <items-grid :items="visibleItems" :kind="kind" @select="navigateToItem" />
        <ion-infinite-scroll :disabled="!canGrow" @ionInfinite="onInfinite($event)">
          <ion-infinite-scroll-content :loading-text="t('list.loading_more')" />
        </ion-infinite-scroll>
      </template>
    </div>
  </ion-content>
</template>

<script lang="ts">
import { defineComponent, markRaw, PropType, ref } from "vue";
import {
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonFab,
  IonFabButton,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from "@ionic/vue";
import { chevronDownCircleOutline, reload, arrowUp } from "ionicons/icons";

import SearchBar from "@/components/SearchBar.vue";
import localizationService from "@/services/general/LocalizationService";
import IconButton from "@/components/ui/IconButton.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import ItemsGrid from "@/components/overview/ItemsGrid.vue";
import type { OverviewItem } from "@/components/overview/OverviewCard.vue";
import type { PlaceholderKind } from "@/components/ui/PlantPlaceholder.vue";
import { compareText } from "@/utils/intlCache";

export type { OverviewImage, OverviewItem } from "@/components/overview/OverviewCard.vue";

/** Cards mounted at first and added per infinite-scroll event. */
export const WINDOW_STEP = 40;

const fallbackKeys = new WeakMap<OverviewItem, string>();

const searchKeyOf = (item: OverviewItem): string => {
  const text = item.searchText;
  if (text !== undefined) return text;
  let key = fallbackKeys.get(item);
  if (key === undefined) {
    key = `${item.name}\n${item.description ?? ""}`.toLowerCase();
    fallbackKeys.set(item, key);
  }
  return key;
};

/** `needle` is trimmed and lowercase; an empty needle returns `items` itself. */
export const filterOverviewItems = (
  items: readonly OverviewItem[],
  needle: string,
): readonly OverviewItem[] =>
  needle ? items.filter((item) => searchKeyOf(item).includes(needle)) : items;

/** Ascending `sortRank` first, then NEW items, then by name in the locale's order. */
export const sortOverviewItems = (
  items: readonly OverviewItem[],
  locale: string,
): readonly OverviewItem[] => {
  const byName = compareText(locale);
  return [...items].sort((a, b) => {
    const rankDelta = (a.sortRank ?? 0) - (b.sortRank ?? 0);
    if (rankDelta !== 0) return rankDelta;
    if (a.isNew && !b.isNew) return -1;
    if (!a.isNew && b.isNew) return 1;
    return byName(a.name, b.name);
  });
};

interface InfiniteTarget {
  complete: () => unknown;
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
    IonInfiniteScroll,
    IonInfiniteScrollContent,
    IconButton,
    StateBlock,
    ItemsGrid,
  },
  props: {
    /** View models; frozen objects let unchanged cards skip their re-render. */
    items: {
      type: Array as PropType<readonly OverviewItem[]>,
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
    /** More items exist beyond `items`; reaching the end of the window emits `load-more`. */
    hasMore: {
      type: Boolean,
      default: false,
    },
    loadingMore: {
      type: Boolean,
      default: false,
    },
    /** The parent searches (and orders) on the server: no local filter, `query-change` instead. */
    serverSearch: {
      type: Boolean,
      default: false,
    },
    /** Count shown in server mode, where `items` holds only the loaded pages. */
    total: {
      type: Number as PropType<number | null>,
      default: null,
    },
    /** False while the page is hidden: the list keeps its last result and recomputes on return. */
    active: {
      type: Boolean,
      default: true,
    },
  },
  emits: ["retry", "empty-action", "load-more", "query-change"],
  setup(props) {
    const contentRef = ref<InstanceType<typeof IonContent> | null>(null);
    const memo = markRaw({
      items: props.items,
      filtered: props.items,
      pendingInfinite: null as InfiniteTarget | null,
    });
    return { contentRef, memo };
  },
  data() {
    return {
      query: "",
      windowSize: WINDOW_STEP,
      chevronDown: chevronDownCircleOutline,
      refreshIcon: reload,
      arrowUp: arrowUp,
      isRefreshing: false,
      showScrollTop: false,
    };
  },
  computed: {
    trimmedQuery(): string {
      return this.query.trim();
    },
    sourceItems(): readonly OverviewItem[] {
      if (!this.active) return this.memo.items;
      this.memo.items = this.items;
      return this.items;
    },
    sortedItems(): readonly OverviewItem[] {
      if (this.presorted) return this.sourceItems;
      return sortOverviewItems(this.sourceItems, localizationService.getLocale());
    },
    filteredItems(): readonly OverviewItem[] {
      if (!this.active) return this.memo.filtered;
      const filtered = this.serverSearch
        ? this.sourceItems
        : filterOverviewItems(this.sortedItems, this.trimmedQuery.toLowerCase());
      this.memo.filtered = filtered;
      return filtered;
    },
    visibleItems(): readonly OverviewItem[] {
      const filtered = this.filteredItems;
      return filtered.length > this.windowSize ? filtered.slice(0, this.windowSize) : filtered;
    },
    canGrow(): boolean {
      return this.windowSize < this.filteredItems.length || this.hasMore;
    },
    showSearch(): boolean {
      return (
        this.sourceItems.length > 0 || this.query !== "" || (this.serverSearch && this.isLoading)
      );
    },
    itemCount(): number {
      return this.serverSearch && this.total !== null ? this.total : this.filteredItems.length;
    },
    newInView(): number {
      let count = 0;
      for (const item of this.filteredItems) if (item.isNew) count++;
      return count;
    },
    showNewCount(): boolean {
      return this.newInView > 0 && this.newInView < this.filteredItems.length;
    },
  },
  watch: {
    items() {
      this.completeInfinite();
    },
    hasMore() {
      this.completeInfinite();
    },
    loadingMore(loading: boolean) {
      if (!loading) this.completeInfinite();
    },
  },
  beforeUnmount() {
    this.memo.pendingInfinite = null;
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
    onSearch(query: string) {
      if (query === this.query) return;
      const previous = this.trimmedQuery;
      this.query = query;
      this.windowSize = WINDOW_STEP;
      if (this.serverSearch && this.trimmedQuery !== previous) {
        this.$emit("query-change", { q: this.trimmedQuery });
      }
    },
    clearSearch() {
      (this.$refs.search as InstanceType<typeof SearchBar> | undefined)?.clearSearch();
    },
    onInfinite(event: CustomEvent) {
      const target = event.target as unknown as InfiniteTarget;
      const available = this.filteredItems.length;
      if (this.windowSize < available) this.windowSize += WINDOW_STEP;
      if (this.windowSize >= available && this.hasMore) {
        this.requestMore(target);
        return;
      }
      target.complete();
    },
    requestMore(target: InfiniteTarget) {
      this.completeInfinite();
      this.memo.pendingInfinite = target;
      if (!this.loadingMore) this.$emit("load-more");
      // A parent that does not report `loadingMore` would leave the spinner pending forever.
      this.$nextTick(() => {
        if (!this.loadingMore) this.completeInfinite();
      });
    },
    completeInfinite() {
      const target = this.memo.pendingInfinite;
      this.memo.pendingInfinite = null;
      target?.complete();
    },
    navigateToItem(id: number | string) {
      if (typeof id !== "number" && typeof id !== "string") {
        console.warn("Invalid item id type:", id);
        return;
      }
      this.onItemClick(id);
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

/* Vertical clipping keeps the shadow bleed of the last card row (ItemsGrid) from adding scroll
   space below the bottom padding. */
.overview {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  overflow-y: clip;
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
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--new);
  color: var(--new-ink);
}
</style>
