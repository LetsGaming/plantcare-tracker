<template>
  <ion-content
    ref="contentRef"
    :scroll-events="true"
    @ionScroll="handleScroll($event)"
  >
    <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
      <ion-refresher-content
        :pulling-icon="chevronDown"
        :pulling-text="t('pullToRefresh.pull')"
        refreshing-spinner="circles"
        :refreshing-text="t('pullToRefresh.refreshing')"
      />
    </ion-refresher>

    <div
      class="refresh-button-container"
      :style="isRefreshing ? 'right: 93.5%;' : ''"
    >
      <ion-button
        size="small"
        fill="clear"
        @click="manualRefresh"
        :disabled="isRefreshing"
      >
        <template v-if="isRefreshing">
          <ion-spinner name="dots" />
          {{ t("pullToRefresh.loading") }}
        </template>
        <template v-else>
          <ion-icon :icon="refreshIcon" />
        </template>
      </ion-button>
    </div>

    <ion-fab
      v-if="showScrollTop"
      vertical="bottom"
      horizontal="end"
      slot="fixed"
      class="scroll-top-fab"
    >
      <ion-fab-button size="small" @click="scrollToTop">
        <ion-icon :icon="arrowUp" />
      </ion-fab-button>
    </ion-fab>

    <div class="content-container">
      <template v-if="items.length">
        <div class="header-actions align-middle">
          <search-bar
            @search="filterItems"
            :placeholder="t('search.placeholder')"
            class="search-bar-flex"
          />
        </div>

        <ion-text class="align-middle" color="tertiary">
          {{ filteredItems.length }} {{ t("overview.items") }}
        </ion-text>
      </template>

      <template v-if="filteredItems.length">
        <ion-grid class="item-grid">
          <ion-row>
            <ion-col
              v-for="item in filteredItems"
              :key="item.id"
              size-sm="6"
              size-md="4"
              size-lg="3"
              size-xl="4"
              class="responsive-col"
            >
              <ion-card class="item-card" @click="navigateToItem(item.id)">
                <ion-badge
                  v-if="item.isNew"
                  class="new-badge round-badge"
                  color="danger"
                >
                  {{ t("label.new") }}
                </ion-badge>
                <div
                  :class="['item-image-wrapper', { 'image-only': imageOnly }]"
                >
                  <ProgressiveImage
                    :src="item.imageUrl"
                    :alt="t('image.alt', { name: item.name })"
                  />
                </div>

                <ion-card-content v-if="!imageOnly" class="item-content">
                  <ion-card-title class="item-title">
                    {{ item.name }}
                  </ion-card-title>

                  <ion-card-subtitle
                    v-if="item.description"
                    class="item-description"
                  >
                    {{ item.description }}
                  </ion-card-subtitle>

                  <ion-text color="medium" class="more-details">
                    {{ t("overview.more_details") }}
                  </ion-text>
                </ion-card-content>
              </ion-card>
            </ion-col>
          </ion-row>
        </ion-grid>
      </template>

      <template v-else>
        <ion-text color="secondary" class="align-middle align-horizontal">
          {{ t("overview.no_entries") }}
        </ion-text>
      </template>
    </div>
  </ion-content>
</template>

<script lang="ts">
import { defineComponent, PropType, ref } from "vue";
import {
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardTitle,
  IonCardContent,
  IonCardSubtitle,
  IonText,
  IonImg,
  IonBadge,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonFab,
  IonFabButton,
} from "@ionic/vue";
import { chevronDownCircleOutline, reload, arrowUp } from "ionicons/icons";

import SearchBar from "@/components/SearchBar.vue";
import Utils from "@/utils/utils";
import localizationService from "@/services/general/LocalizationService";
import ProgressiveImage from "@/components/ProgressiveImage.vue";

export interface OverviewItem {
  id: string | number;
  name: string;
  imageUrl?: string;
  description?: string;
  isNew?: boolean;
}

export default defineComponent({
  name: "ItemsOverview",
  components: {
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardTitle,
    IonCardSubtitle,
    IonCardContent,
    IonText,
    IonImg,
    IonBadge,
    SearchBar,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonIcon,
    IonSpinner,
    IonFab,
    IonFabButton,
    ProgressiveImage,
  },
  props: {
    items: {
      type: Array as PropType<OverviewItem[]>,
      required: true,
    },
    imageOnly: {
      type: Boolean,
      default: false,
    },
    onItemClick: {
      type: Function as PropType<(id: any) => void>,
      required: true,
    },
    onRefreshItems: {
      type: Function as PropType<() => Promise<void>>,
      required: true,
    },
  },
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
      isRefreshing: false,
      showScrollTop: false,
    };
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback || key);
    },
    handleScroll(event: CustomEvent) {
      // Show button if user scrolled down more than 300px
      this.showScrollTop = event.detail.scrollTop > 300;
    },
    async scrollToTop() {
      if (this.contentRef) {
        // Use the native scrollToTop method
        await this.contentRef.$el.scrollToTop(500); // 500ms duration
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
    sortItems(items: OverviewItem[]) {
      return [...items].sort((a, b) => {
        if (a.isNew && !b.isNew) return -1;
        if (!a.isNew && b.isNew) return 1;
        return a.name.localeCompare(b.name);
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
      handler(newItems) {
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
/* SCROLL TOP STYLES */
.scroll-top-fab {
  margin-bottom: 10vh;
}

.scroll-top-fab ion-fab-button {
  --box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  --background: var(--ion-color-tertiary);
  --color: white;
  transition: background-color 0.3s ease;
}

/* REFRESHER & LAYOUT STYLES */
.refresh-button-container {
  position: absolute;
  right: 95%;
  padding: 8px 16px;
  z-index: 10;
}

.content-container {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.search-bar-flex {
  flex: 1;
}

.extra-filters-wrapper {
  flex-shrink: 0;
}

ion-refresher {
  --background: #f0f0f0;
  --pulling-icon-color: #3880ff;
  --refreshing-icon-color: #3880ff;
}

ion-content {
  --padding-top: 0;
  --padding-bottom: 0;
}

/* YOUR ORIGINAL STYLING RESTORED EXACTLY */
ion-col {
  flex-basis: auto !important;
}

.item-grid {
  width: 100%;
  padding: 20px;
}

.item-card {
  position: relative;
  overflow: visible;
  height: 90%;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  border-radius: 15px;
  transition:
    transform 0.3s ease,
    box-shadow 0.3s ease;
}

.item-card:hover {
  transform: scale(1.03);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.new-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  font-size: 0.7rem;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  border: 2px solid white;
}

.item-image-wrapper {
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 15px 15px 0 0;
}

.image-only {
  height: 100% !important;
  width: 100% !important;
  border-radius: 15px !important;
}

.item-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 4px;
  max-width: 85%;
}

.item-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}

.more-details {
  margin-top: auto;
  font-weight: 500;
  text-align: center;
}

@media (min-width: 1081px) {
  .item-card {
    flex-direction: row;
    height: 250px;
  }

  .item-image-wrapper {
    width: 250px;
    height: 100%;
    aspect-ratio: unset;
    flex-shrink: 0;
    border-radius: 15px 0 0 15px;
  }

  .item-content {
    text-align: left;
    padding-left: 12px;
  }
}

@media (min-width: 2560px) {
  .responsive-col {
    flex: 0 0 calc(calc(3 / 12) * 100%) !important;
    width: calc(calc(3 / 12) * 100%) !important;
    max-width: calc(calc(3 / 12) * 100%) !important;
  }
}

@media (max-width: 1024px) and (min-width: 769px) {
  .item-image-wrapper {
    height: 200px;
  }
}

@media (max-width: 1440px) and (min-width: 769px) {
  .refresh-button-container {
    right: 90%;
  }
}

@media (max-width: 1024px) {
  .item-title {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  .refresh-button-container {
    display: none;
  }
}
</style>
