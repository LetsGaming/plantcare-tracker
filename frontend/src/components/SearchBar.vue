<template>
  <ion-item class="search-bar" lines="none">
    <ion-input
      class="search-input"
      v-model="searchQuery"
      :placeholder="placeholder"
      @ionInput="emitSearch"
      clear-input
    ></ion-input>
  </ion-item>
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
  padding: 10px 0;
}

.search-input {
  width: 100%;
  padding: 10px;
  font-size: 1rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.clear-icon {
  cursor: pointer;
  font-size: 1.5rem;
  margin-left: 8px;
}
</style>
