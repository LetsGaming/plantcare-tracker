<template>
  <search-bar
    @search="filterItems"
    placeholder="Suche..."
    class="align-middle"
  />
  <ion-grid class="item-grid">
    <ion-row>
      <ion-col
        size-xs="12"
        size-sm="8"
        size-md="4"
        size-lg="3"
        v-for="item in filteredItems"
        :key="item.id"
      >
        <ion-card class="item-card" @click="navigateToItem(item.id)">
          <ion-card-content>
            <ion-grid>
              <ion-row class="item-row">
                <!-- Image Column -->
                <ion-col size-xs="12" size-sm="5" size-md="6">
                  <div class="item-image-wrapper">
                    <ion-img
                      :src="item.imageUrl || '/no-image.png'"
                      :alt="`${item.name} Image`"
                      class="item-image"
                    />
                  </div>
                </ion-col>

                <!-- Text Column -->
                <ion-col size-xs="12" size-sm="7" size-md="6" class="text-col">
                  <ion-card-title class="item-title">{{
                    item.name
                  }}</ion-card-title>
                  <div class="card-details-container">
                    <ion-card-subtitle
                      v-show="item.description"
                      class="item-description"
                    >
                      {{ item.description }}
                    </ion-card-subtitle>
                    <ion-text color="medium">Mehr Details</ion-text>
                  </div>
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </ion-col>
    </ion-row>
  </ion-grid>
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
  IonText,
  IonImg,
  IonCardSubtitle,
} from "@ionic/vue";

import SearchBar from "@/components/SearchBar.vue";

export default defineComponent({
  name: "ItemGrid",
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
    SearchBar,
  },
  props: {
    items: {
      type: Array as PropType<
        Array<{
          id: number;
          name: string;
          imageUrl?: string;
          description?: string;
        }>
      >,
      required: true,
    },
    onItemClick: {
      type: Function as PropType<(id: number) => void>,
      required: true,
    },
  },
  data() {
    return {
      // Holds the current search query for filtering purposes
      currentSearch: "",
      filteredItems: [] as any[],
    };
  },
  methods: {
    filterItems(query: string) {
      this.currentSearch = query;
      const filtered = this.items.filter((item) =>
        item.name.toLowerCase().includes(query.toLowerCase())
      );
      this.filteredItems = this.sortItems(filtered);
    },
    sortItems(items: any[]) {
      return items.sort((a, b) => a.name.localeCompare(b.name));
    },
    navigateToItem(id: number) {
      this.onItemClick(id);
    },
  },
  mounted() {
    // Initialize filteredItems with all items (sorted) when the component mounts
    this.filteredItems = this.sortItems(this.items);
  },
  watch: {
    // Reapply filtering when the items prop changes
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
.item-grid {
  padding: 20px;
}

.item-card {
  cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  border-radius: 15px;
}

.item-card:hover {
  transform: scale(1.05);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
}

.item-title {
  text-align: center;
}

.item-image-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.item-image {
  object-fit: cover;
  border-radius: 15px 15px 0 0;
}

.item-image::part(image) {
  width: 200px;
  height: 200px;
}

.card-details-container {
  height: 90%;
  margin-left: 2%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.item-description {
  padding: 5%;
  text-align: center;
}

@media (max-width: 768px) {
  .item-grid {
    display: flex;
    flex-direction: column;
  }
 
  .card-details-container {
    text-align: center;
  }
}
</style>
