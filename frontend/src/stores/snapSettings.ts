import { defineStore } from "pinia";
import type { PersistEntry } from "./persistence";

const initialState = () => ({
  keepPhoto: true,
  loaded: false,
});

type SnapSettingsState = ReturnType<typeof initialState>;

const keepPhotoEntry: PersistEntry<SnapSettingsState> = {
  key: "snap_keep_photo",
  keepOnClear: true,
  allowExpired: true,
  pick: (state) => state.keepPhoto,
  apply: (state, data: unknown) => {
    state.keepPhoto = data !== false;
  },
};

export const useSnapSettingsStore = defineStore("snapSettings", {
  state: initialState,

  persist: { entries: [keepPhotoEntry] },

  actions: {
    async ensureLoaded(): Promise<void> {
      if (this.loaded) return;
      await this.$hydrate();
      this.loaded = true;
    },

    setKeepPhoto(value: boolean): void {
      this.keepPhoto = value;
    },
  },
});
