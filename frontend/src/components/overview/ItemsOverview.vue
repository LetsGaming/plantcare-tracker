<template>
  <pull-to-refresh @refresh="onRefreshItems">
    <template v-if="items.length">
      <search-bar
        @search="filterItems"
        :placeholder="t('search.placeholder')"
        class="align-middle"
      />
      <ion-text class="align-middle" color="tertiary">{{ filteredItems.length }} {{ t('overview.items') }}</ion-text>
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
                {{ t('label.new') }}
              </ion-badge>
              <div :class="['item-image-wrapper', { 'image-only': imageOnly }]">
                <ion-img
                  :src="item.imageUrl || '/no-image.png'"
                  :alt="t('image.alt', { name: item.name })"
                  @ion-error="($event) => ($event.target.src = '/no-image.png')"
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
                  {{ t('overview.more_details') }}
                </ion-text>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>
    </template>

    <template v-else>
      <ion-text color="secondary" class="align-middle align-horizontal">
        {{ t('overview.no_entries') }}
      </ion-text>
    </template>
  </pull-to-refresh>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
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
} from "@ionic/vue";

import SearchBar from "@/components/SearchBar.vue";
import PullToRefresh from "@/components/PullToRefresh.vue";
import Utils from "@/utils/utils";
import localizationService from '@/services/general/LocalizationService';

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
    PullToRefresh,
  },
  props: {
    items: {
      type: Array as PropType<OverviewItem[]
      >,
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
  data() {
    return {
      currentSearch: "",
      filteredItems: [] as OverviewItem[],
    };
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback)
    },
    filterItems(query: string) {
      this.currentSearch = query;
      const filtered = Utils.baseSearchFilter(query, this.items);
      this.filteredItems = this.sortItems(filtered);
    },
    sortItems(items: OverviewItem[]) {
      return [...items].sort((a, b) => {
        // 1. Sort by isNew status (true before false)
        if (a.isNew && !b.isNew) return -1;
        if (!a.isNew && b.isNew) return 1;

        // 2. If both have the same isNew status, sort by name
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
  mounted() {
    this.filteredItems = this.sortItems(this.items);
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
ion-col {
  flex-basis: auto !important;
}

.item-grid {
  width: 100%;
  padding: 20px;
}

/* CARD BASE */
.item-card {
  position: relative;
  /* Important: Ensure overflow is visible so the badge can hang outside */
  overflow: visible;
  height: 90%;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  border-radius: 15px;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.item-card:hover {
  transform: scale(1.03);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.new-badge {
  position: absolute;
  /* Adjust these negative values to move the badge further outside or inside */
  top: 8px;
  right: 8px;

  z-index: 20; /* Higher than images */

  font-size: 0.7rem;
  font-weight: bold;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  border: 2px solid white; /* Adds a clean separation from the card */
}

/* IMAGE */
.item-image-wrapper {
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  border-radius: 15px 15px 0 0; /* Match card top radius */
}

.image-only {
  height: 100% !important;
  width: 100% !important;
  border-radius: 15px !important;
}

.item-image-wrapper ion-img {
  width: 100%;
  height: 100%;
}

.item-image-wrapper ion-img::part(image) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* CONTENT */
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
    border-radius: 15px 0 0 15px; /* Adjust radius for horizontal layout */
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
</style>
