import { defineComponent } from "vue";
import { icons } from "@/theme/icons";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import type { PagedState } from "@/stores/paged";

/** What the overview mixin needs from an owned-plus-public list store. */
export interface SegmentedListStore<T extends object> {
  readonly mine: PagedState<T>;
  readonly public: PagedState<T>;
  ensureMine(options?: { force?: boolean }): Promise<void>;
  ensurePublic(options?: { force?: boolean }): Promise<void>;
  setPublicQuery(q: string): Promise<void>;
  loadMorePublic(): Promise<void>;
}

export interface SegmentedListConfig<T extends object> {
  useStore: () => SegmentedListStore<T>;
  initialSegment: () => "public" | "private";
  /** Used in log lines, for example "plants". */
  noun: string;
  keys: {
    publicSegment: string;
    privateSegment: string;
    emptyPublicTitle: string;
    emptyPrivateTitle: string;
    emptyPublicMessage: string;
    emptyPrivateMessage: string;
    emptyAction: string;
  };
  onRefreshed(isPublic: boolean): void;
}

const t = (key: string) => localizationService.t(key);

/**
 * The segmented (public or private) list controller of an overview page: segment state, list
 * status computeds and the load, refresh, paging and search actions. The page keeps its card
 * mapping, its extra actions and its `ionViewWillEnter` hook (Ionic ignores that hook in mixins).
 */
export const segmentedList = <T extends object>(config: SegmentedListConfig<T>) =>
  defineComponent({
    data() {
      return { showPublic: config.initialSegment() as string };
    },

    computed: {
      isGuest(): boolean {
        return useSessionStore().isGuest;
      },
      mineList(): PagedState<T> {
        return config.useStore().mine;
      },
      publicList(): PagedState<T> {
        return config.useStore().public;
      },
      isPublic(): boolean {
        return this.showPublic === "public";
      },
      segments() {
        return [
          { value: "public", label: t(config.keys.publicSegment), icon: icons.segmentPublic },
          {
            value: "private",
            label: t(config.keys.privateSegment),
            icon: icons.segmentPrivate,
            hideFromGuests: true,
          },
        ];
      },
      activeList(): PagedState<T> {
        return this.isPublic ? this.publicList : this.mineList;
      },
      isLoadingList(): boolean {
        const { status, items } = this.activeList;
        return status === "idle" || (status === "loading" && items.length === 0);
      },
      hasError(): boolean {
        return this.activeList.status === "error";
      },
      hasMore(): boolean {
        return this.isPublic && this.publicList.nextCursor !== null;
      },
      loadingMore(): boolean {
        return this.isPublic && this.publicList.loadingMore;
      },
      listTotal(): number | null {
        return this.isPublic ? this.publicList.total : null;
      },
      emptyTitle(): string {
        return t(this.isPublic ? config.keys.emptyPublicTitle : config.keys.emptyPrivateTitle);
      },
      emptyMessage(): string {
        if (this.isGuest) return t("state.guest_hint");
        return t(this.isPublic ? config.keys.emptyPublicMessage : config.keys.emptyPrivateMessage);
      },
      emptyActionLabel(): string {
        return !this.isGuest && !this.isPublic ? t(config.keys.emptyAction) : "";
      },
    },

    methods: {
      async loadItems(isRefresh = false): Promise<void> {
        const store = config.useStore();
        try {
          if (this.isPublic) await store.ensurePublic({ force: isRefresh });
          else await store.ensureMine({ force: isRefresh });
          if (isRefresh) config.onRefreshed(this.isPublic);
        } catch (error) {
          // handleRequest has already shown the error toast.
          console.error(`Loading ${config.noun} failed:`, error);
        }
      },

      fetchItems(): Promise<void> {
        return this.loadItems();
      },

      refreshItems(): Promise<void> {
        return this.loadItems(true);
      },

      async loadMoreItems(): Promise<void> {
        if (!this.isPublic) return;
        try {
          await config.useStore().loadMorePublic();
        } catch (error) {
          console.error(`Loading more ${config.noun} failed:`, error);
        }
      },

      async changeQuery({ q }: { q: string }): Promise<void> {
        if (!this.isPublic) return;
        try {
          await config.useStore().setPublicQuery(q);
        } catch (error) {
          console.error(`Searching ${config.noun} failed:`, error);
        }
      },

      handleSegmentChange(value: string): void {
        // The new segment is set first so the clear below is not taken for a search of the old one.
        this.showPublic = value;
        (this.$refs.overview as { clearSearch?: () => void } | undefined)?.clearSearch?.();
        if (value === "public" && this.publicList.query.q !== "") {
          void this.changeQuery({ q: "" });
          return;
        }
        void this.fetchItems();
      },
    },
  });
