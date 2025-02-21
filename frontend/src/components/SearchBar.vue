<template>
  <div class="search-bar">
    <input
      v-model="searchQuery"
      class="search-input"
      type="text"
      :placeholder="placeholder"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";

export default defineComponent({
  props: {
    items: {
      type: Array as PropType<any[]>,
      required: true,
    },
    searchKey: {
      type: String as PropType<string>,
      required: true,
    },
    placeholder: {
      type: String as PropType<string>,
      default: "Search...",
    },
  },
  emits: ["filtered"],
  data() {
    return {
      searchQuery: "",
    };
  },
  mounted() {
    this.filterItems();
  },
  watch: {
    searchQuery() {
      this.filterItems();
    },
  },
  methods: {
    filterItems() {
      const filtered = this.items.filter((item) =>
        item[this.searchKey]
          .toLowerCase()
          .includes(this.searchQuery.toLowerCase())
      );
      this.$emit("filtered", filtered);
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
