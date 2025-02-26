<template>
  <search-bar
    :items="items"
    search-key="name"
    @filtered="updateFilteredItems"
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
              <ion-row>
                <ion-col>
                  <div class="item-image-wrapper">
                    <ion-img
                      :src="item.imageUrl || '/no-image.png'"
                      :alt="`${item.name} Image`"
                      class="item-image"
                    />
                  </div>
                </ion-col>
                <ion-col>
                  <ion-card-title>{{ item.name }}</ion-card-title>
                  <div class="card-details-container">
                    <ion-card-subtitle
                      v-show="item.description"
                      class="item-description"
                      >{{ item.description }}</ion-card-subtitle
                    >
                    <ion-text color="medium" style="text-wrap: nowrap"
                      >Klicke für mehr Details</ion-text
                    >
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
  IonCardHeader,
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
    IonCardHeader,
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
      filteredItems: [] as any[],
    };
  },
  methods: {
    updateFilteredItems(filtered: any[]) {
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
    // Sort and initialize filteredItems with the sorted items
    this.filteredItems = this.sortItems(this.items);
  },
  watch: {
    // Watch for changes to the items prop and update filteredItems accordingly
    items: {
      immediate: true,
      handler(newItems) {
        this.filteredItems = this.sortItems(newItems);
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

.item-image-wrapper {
  max-height: 200px;
  max-width: 200px;
}

.item-image {
  max-height: inherit;
  max-width: inherit;
  border-radius: 15px 15px 0 0;
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
</style>
