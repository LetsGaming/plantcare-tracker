<template>
  <ion-page>
    <overview-header
      :title="t('substrate.title')"
      :segments="[
        {
          value: 'public',
          label: t('substrate.public_label'),
          icon: icons.segmentPublic,
        },
        {
          value: 'private',
          label: t('substrate.private_label'),
          icon: icons.segmentPrivate,
          hideFromGuests: true,
        },
      ]"
      :showAddButton="true"
      :addIcon="icons.add"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      :items="substrates"
      kind="substrate"
      :is-loading="isLoadingList"
      :has-error="hasError"
      :empty-title="emptyTitle"
      :empty-message="emptyMessage"
      :empty-action-label="emptyActionLabel"
      @item-click="navigateToSubstrate"
      @refresh-items="refreshSubstrates"
      @retry="refreshSubstrates"
      @empty-action="openAddModal"
    />

    <SubstrateAddingModal
      :is-open="showAddingModal"
      :available-components="availableComponents"
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
import { useComponentsStore } from "@/stores/components";
import { useSessionStore } from "@/stores/session";
import localizationService from "@/services/general/LocalizationService";
import ToastService from "@/services/general/ToastService";

import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import SubstrateAddingModal from "@/components/substrates/SubstrateAddingModal.vue";

export default defineComponent({
  name: "SubstrateOverview",
  components: { IonPage, OverviewHeader, ItemsOverview, SubstrateAddingModal },
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
    ...mapState(useSubstratesStore, ["publicSubstrates", "privateSubstrates", "status"]),
    ...mapState(useSessionStore, ["isGuest"]),
    ...mapState(useComponentsStore, { allComponents: "items" }),
    isPublic() {
      return this.showPublic === "public";
    },
    isLoadingList(): boolean {
      return this.status === "loading" || this.status === "idle";
    },
    hasError(): boolean {
      return this.status === "error";
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
    /** The segment's substrates; the store repaints this after every mutation. */
    substrates(): Substrate[] {
      return this.isPublic ? this.publicSubstrates : this.privateSubstrates;
    },
    availableComponents(): SubstrateComponent[] {
      return this.allComponents
        .map((comp: Component) => ({
          ...comp,
          description: comp.fineness || "",
          parts: 0,
        }))
        .sort((a: SubstrateComponent, b: SubstrateComponent) => a.name.localeCompare(b.name));
    },
  },
  async ionViewWillEnter() {
    await Promise.all([this.fetchSubstrates(), this.fetchAvailableComponents()]);
  },
  methods: {
    ...mapActions(useSubstratesStore, {
      ensureSubstratesLoaded: "ensureLoaded",
      createSubstrate: "addSubstrateWithComponents",
      uploadSubstrateImage: "uploadSubstrateImage",
    }),
    ...mapActions(useComponentsStore, { ensureComponentsLoaded: "ensureLoaded" }),
    t: (k: string, v?: any) => localizationService.t(k, v),

    async fetchAvailableComponents() {
      try {
        await this.ensureComponentsLoaded();
      } catch (e) {
        console.error("Error loading components", e);
      }
    },

    async loadSubstrates(isRefresh = false) {
      try {
        await this.ensureSubstratesLoaded({ force: isRefresh });

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

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchSubstrates();
    },

    openAddModal() {
      this.showAddingModal = true;
      if (this.availableComponents.length === 0) {
        this.fetchAvailableComponents();
      }
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
      // ---- validation ----
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

        const newSubstrateId = await this.createSubstrate(
          {
            name: payload.meta.name,
            isPublic: payload.meta.isPublic,
          },
          {
            components,
          },
        );

        if (!newSubstrateId) return;

        let photoSaved = true;
        if (payload.meta.image) {
          // The upload refreshes the substrate (now including the image) in the store.
          try {
            await this.uploadSubstrateImage(newSubstrateId, payload.meta.image);
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
