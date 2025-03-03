<template>
  <div class="search-bar">
    <input
      v-model="searchQuery"
      class="search-input"
      type="text"
      :placeholder="placeholder"
      @input="emitSearch"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "SearchBar",
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
  border: 1px solid var(--ion-color-light);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}
</style>
