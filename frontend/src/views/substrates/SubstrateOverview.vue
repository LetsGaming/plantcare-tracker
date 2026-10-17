<template>
  <ion-page>
    <overview-header
      :title="t('substrate.title')"
      :segments="segments"
      :showAddButton="true"
      :addIcon="icons.add"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      ref="overview"
      :items="overviewItems"
      kind="substrate"
      :is-loading="isLoadingList"
      :has-error="hasError"
      :empty-title="emptyTitle"
      :empty-message="emptyMessage"
      :empty-action-label="emptyActionLabel"
      :active="pageActive"
      :has-more="hasMore"
      :loading-more="loadingMore"
      :server-search="isPublic"
      :total="listTotal"
      :list-key="showPublic"
      @item-click="navigateToSubstrate"
      @refresh-items="refreshSubstrates"
      @retry="refreshSubstrates"
      @empty-action="openAddModal"
      @load-more="loadMoreSubstrates"
      @query-change="changeQuery"
    />

    <SubstrateAddingModal
      :is-open="showAddingModal"
      :is-loading="isSubmitting"
      @close="showAddingModal = false"
      @save="handleSubstrateSave"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage } from "@ionic/vue";
import { icons } from "@/theme/icons";
import { mapActions, mapState } from "pinia";
import { useSubstratesStore } from "@/stores/substrates";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import ToastService from "@/services/general/ToastService";
import { isActive, pageActive } from "@/utils/pageActive";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import type { OverviewItem } from "@/components/overview/OverviewCard.vue";
import SubstrateAddingModal from "@/components/substrates/SubstrateAddingModal.vue";

const NO_ITEMS: readonly OverviewItem[] = Object.freeze([]);

/** One overview item per substrate object, so an unchanged substrate keeps its card props. */
const itemCache = new WeakMap<SubstrateView, OverviewItem>();
const lastItems = new WeakMap<object, readonly OverviewItem[]>();

const cardFor = (substrate: SubstrateView): OverviewItem => {
  const cached = itemCache.get(substrate);
  if (cached) return cached;
  const item: OverviewItem = Object.freeze({
    id: substrate.id,
    name: substrate.name,
    image: substrate.cover,
    imageUrl: substrate.cover?.url,
    searchText: substrate.searchText,
  });
  itemCache.set(substrate, item);
  return item;
};

export default defineComponent({
  name: "SubstrateOverview",
  components: { IonPage, OverviewHeader, ItemsOverview, SubstrateAddingModal },
  mixins: [pageActive],
  data() {
    return {
      showPublic: "private",
      showAddingModal: false,
      isSubmitting: false,
    };
  },
  setup() {
    return { icons };
  },
  computed: {
    ...mapState(useSubstratesStore, { mineList: "mine", publicList: "public" }),
    ...mapState(useSessionStore, ["isGuest"]),
    segments() {
      return [
        { value: "public", label: this.t("substrate.public_label"), icon: icons.segmentPublic },
        {
          value: "private",
          label: this.t("substrate.private_label"),
          icon: icons.segmentPrivate,
          hideFromGuests: true,
        },
      ];
    },
    isPublic(): boolean {
      return this.showPublic === "public";
    },
    activeList() {
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
      return this.t(
        this.isPublic ? "shell.empty_substrates_public_title" : "state.empty_substrates_title",
      );
    },
    emptyMessage(): string {
      if (this.isGuest) return this.t("state.guest_hint");
      return this.t(
        this.isPublic ? "shell.empty_substrates_public_message" : "state.empty_substrates_message",
      );
    },
    emptyActionLabel(): string {
      return !this.isGuest && !this.isPublic ? this.t("state.empty_substrates_action") : "";
    },
    /** Cards of the segment; a hidden page keeps its last cards and recomputes once when shown again. */
    overviewItems(): readonly OverviewItem[] {
      if (!isActive(this)) return lastItems.get(this.$) ?? NO_ITEMS;
      const items = this.activeList.items.map(cardFor);
      lastItems.set(this.$, items);
      return items;
    },
  },
  async ionViewWillEnter() {
    await this.fetchSubstrates();
  },
  methods: {
    ...mapActions(useSubstratesStore, {
      ensureMine: "ensureMine",
      ensurePublic: "ensurePublic",
      setPublicQuery: "setPublicQuery",
      loadMorePublic: "loadMorePublic",
      createSubstrate: "addSubstrate",
      uploadSubstrateImage: "uploadSubstrateImage",
    }),
    t: (k: string, v?: any) => localizationService.t(k, v),

    async loadSubstrates(isRefresh = false) {
      try {
        if (this.isPublic) await this.ensurePublic({ force: isRefresh });
        else await this.ensureMine({ force: isRefresh });

        if (isRefresh) {
          ToastService.showSuccess({
            key: "substrate.refreshed",
            vars: {
              type: this.isPublic
                ? this.t("substrate.public_label")
                : this.t("substrate.private_label"),
            },
          });
        }
      } catch (error) {
        // handleRequest has already shown the error toast.
        console.error("Error loading substrates:", error);
      }
    },

    async fetchSubstrates() {
      await this.loadSubstrates();
    },

    async refreshSubstrates() {
      await this.loadSubstrates(true);
    },

    async loadMoreSubstrates() {
      if (!this.isPublic) return;
      try {
        await this.loadMorePublic();
      } catch (error) {
        console.error("Loading more substrates failed:", error);
      }
    },

    async changeQuery({ q }: { q: string }) {
      if (!this.isPublic) return;
      try {
        await this.setPublicQuery(q);
      } catch (error) {
        console.error("Substrate search failed:", error);
      }
    },

    handleSegmentChange(value: string) {
      // The new segment is set first so the clear below is not taken for a search of the old one.
      this.showPublic = value;
      (this.$refs.overview as InstanceType<typeof ItemsOverview> | undefined)?.clearSearch();
      if (value === "public" && this.publicList.query.q !== "") {
        this.changeQuery({ q: "" });
        return;
      }
      this.fetchSubstrates();
    },

    openAddModal() {
      this.showAddingModal = true;
    },

    async handleSubstrateSave(payload: {
      meta: {
        name: string;
        isPublic: boolean;
        image?: File | null;
      };
      componentIds: number[];
      parts: Record<number, number>;
    }) {
      if (!payload.meta.name) {
        return ToastService.showWarning({
          key: "substrate.name_required",
        });
      }

      if (payload.componentIds.length === 0) {
        return ToastService.showWarning({
          key: "substrate.select_component_required",
        });
      }

      this.isSubmitting = true;

      try {
        const components = payload.componentIds.map((id) => ({
          componentId: id,
          parts: parseFloat(String(payload.parts[id])) || 1,
        }));

        const created = await this.createSubstrate({
          name: payload.meta.name,
          isPublic: payload.meta.isPublic,
          components,
        });

        let photoSaved = true;
        if (payload.meta.image) {
          try {
            await this.uploadSubstrateImage(created.id, payload.meta.image);
          } catch (error) {
            console.error("Substrate image upload failed:", error);
            photoSaved = false;
          }
        }

        if (photoSaved) ToastService.showSuccess({ key: "substrate.added" });
        else ToastService.showWarning({ key: "shell.photo_failed_substrate" });
        this.showAddingModal = false;
      } catch (error) {
        // handleRequest has already shown the error toast.
        console.error("Substrate add failed:", error);
      } finally {
        this.isSubmitting = false;
      }
    },

    navigateToSubstrate(id: number) {
      this.$router.push({
        name: "substrate-details",
        params: { id, public: this.isPublic ? "1" : "0" },
      });
    },
  },
});
</script>
