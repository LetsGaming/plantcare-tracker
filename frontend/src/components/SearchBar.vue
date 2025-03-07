<template>
  <div class="search-bar" lines="none">
    <ion-input
      class="search-input"
      v-model="searchQuery"
      :placeholder="placeholder"
      @ionInput="emitSearch"
      clear-input
    ></ion-input>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonItem, IonInput, IonIcon } from "@ionic/vue";

export default defineComponent({
  name: "SearchBar",
  components: {
    IonItem,
    IonInput,
    IonIcon,
  },
  props: {
    placeholder: {
      type: String,
      default: "Search...",
    },
  },
  data() {
    return {
      searchQuery: "",
    };
  },
  methods: {
    emitSearch() {
      // Emit the current search query to the parent component
      this.$emit("search", this.searchQuery);
    },
    clearSearch() {
      this.searchQuery = "";
      this.emitSearch();
    },
  },
});
</script>

<style scoped>
.search-bar {
  margin-top: 20px;
  padding: 12px 16px; /* Added padding for better look */
  border-radius: 20px; /* Increased border-radius for more rounded edges */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2); /* Stronger shadow for better visibility */
  border: 2px solid rgba(110, 110, 110, 0.1); /* Lighter border for better contrast */
}

.search-input {
  width: 100%;
  font-size: 1rem;
}

.clear-icon {
  cursor: pointer;
  font-size: 1.5rem;
  margin-left: 8px;
}
</style>
