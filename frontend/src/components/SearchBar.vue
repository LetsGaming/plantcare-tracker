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
import localizationService from "@/services/general/LocalizationService";

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
      observer: null as MutationObserver | null,
    };
  },
  mounted() {
    this.emitSearch();
    this.localizeInner();
    this.observer = new MutationObserver(() => this.localizeInner());
    this.observer.observe(this.$el as Element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-label"],
    });
  },
  beforeUnmount() {
    this.observer?.disconnect();
    this.observer = null;
  },
  methods: {
    /** Ionic hard-codes English labels on the inner input and clear button. */
    localizeInner() {
      const host = this.$el as HTMLElement;
      const hostLabel = host.getAttribute("aria-label") || this.placeholder;
      const input = host.querySelector("input.searchbar-input");
      if (input && input.getAttribute("aria-label") !== hostLabel) {
        input.setAttribute("aria-label", hostLabel);
      }
      const clearLabel = localizationService.t("copy2.search.clear");
      const clear = host.querySelector("button.searchbar-clear-button");
      if (clear && clear.getAttribute("aria-label") !== clearLabel) {
        clear.setAttribute("aria-label", clearLabel);
      }
    },
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
