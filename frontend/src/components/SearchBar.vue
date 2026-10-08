<template>
  <ion-searchbar
    class="search-bar"
    :value="searchQuery"
    :placeholder="placeholder"
    :debounce="0"
    show-clear-button="focus"
    inputmode="search"
    enterkeyhint="search"
    @ionInput="onInput"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonSearchbar } from "@ionic/vue";

export default defineComponent({
  name: "SearchBar",
  emits: ["search"],
  components: {
    IonSearchbar,
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
  mounted() {
    // Emit current value on mount so parent can initialize filters
    this.emitSearch();
  },
  methods: {
    onInput(event: CustomEvent) {
      this.searchQuery = (event.detail.value ?? "").toString();
      this.emitSearch();
    },
    emitSearch() {
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
  --background: var(--surface-raised);
  --border-radius: var(--radius-md);
  --box-shadow: inset 0 0 0 1px var(--line);
  --color: var(--ion-text-color);
  --placeholder-color: var(--ink-soft);
  --placeholder-opacity: 1;
  --icon-color: var(--ink-soft);
  --clear-button-color: var(--ink-soft);
  padding: 0;
  min-height: var(--tap-min);
}
</style>
