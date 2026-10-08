/**
 * stores/layout.ts
 *
 * Shell layout preferences kept in the browser. Survives logout and never expires.
 */

import { defineStore } from "pinia";
import type { PersistEntry } from "./persistence";

const initialState = () => ({
  menuCollapsed: false,
  loaded: false,
});

type LayoutState = ReturnType<typeof initialState>;

const menuCollapsedEntry: PersistEntry<LayoutState> = {
  key: "menu_collapsed",
  keepOnClear: true,
  allowExpired: true,
  pick: (state) => state.menuCollapsed,
  apply: (state, data: unknown) => {
    state.menuCollapsed = data === true;
  },
};

export const useLayoutStore = defineStore("layout", {
  state: initialState,

  persist: { entries: [menuCollapsedEntry] },

  actions: {
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return;
      await this.$hydrate();
      this.loaded = true;
    },

    toggleMenu(): void {
      this.menuCollapsed = !this.menuCollapsed;
    },
  },
});
