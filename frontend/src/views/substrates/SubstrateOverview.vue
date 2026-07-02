<template>
  <ion-page>
    <overview-header
      :title="t('substrate.title')"
      :segments="[
        {
          value: 'public',
          label: t('substrate.public_label'),
          icon: peopleCircle,
        },
        {
          value: 'private',
          label: t('substrate.private_label'),
          icon: personCircle,
          hideFromGuests: true,
        },
      ]"
      :showAddButton="true"
      :addIcon="addCircle"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="openAddModal"
    />

    <items-overview
      :items="substrates"
      @item-click="navigateToSubstrate"
      @refresh-items="refreshSubstrates"
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
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";
import SubstrateService, { SubstrateEvents } from "@/services/SubstrateService";
import ComponentService from "@/services/ComponentService";
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
      substrates: [] as Substrate[],
      availableComponents: [] as SubstrateComponent[],
      showPublic: "private",
      showAddingModal: false,
      isSubmitting: false,
    };
  },
  setup() {
    return { peopleCircle, personCircle, addCircle };
  },
  computed: {
    isPublic() {
      return this.showPublic === "public";
    },
  },
  async ionViewWillEnter() {
    await Promise.all([
      this.fetchSubstrates(),
      this.fetchAvailableComponents(),
    ]);
  },

  // Cache subscription lives in mounted/beforeUnmount (not the ionView
  // hooks): Ionic keeps pages alive, and the list must keep reacting to
  // mutations made elsewhere (e.g. a substrate edited on its details page).
  mounted() {
    document.addEventListener(
      SubstrateEvents.SUBSTRATES_UPDATED,
      this.handleSubstratesUpdated,
    );
  },

  beforeUnmount() {
    document.removeEventListener(
      SubstrateEvents.SUBSTRATES_UPDATED,
      this.handleSubstratesUpdated,
    );
  },
  methods: {
    t: (k: string, v?: any) => localizationService.t(k, v),

    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getAllComponents();
        this.availableComponents = response
          .map((comp: Component) => ({
            ...comp,
            description: comp.fineness || "",
            parts: 0,
          }))
          .sort((a: SubstrateComponent, b: SubstrateComponent) =>
            a.name.localeCompare(b.name),
          );
      } catch (e) {
        console.error("Error loading components", e);
      }
    },

    async loadSubstrates(isRefresh = false) {
      try {
        const response = this.isPublic
          ? await SubstrateService.getPublicSubstrates(isRefresh)
          : await SubstrateService.getPrivateSubstrates(isRefresh);

        this.substrates = response || [];

        if (this.substrates.length === 0) {
          ToastService.showWarning({
            key: this.isPublic
              ? "substrate.empty_public"
              : "substrate.empty_private",
          });
        } else if (isRefresh) {
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
        this.substrates = [];
        ToastService.showError({ key: "substrate.fetch_error" });
      }
    },

    async fetchSubstrates() {
      await this.loadSubstrates();
    },

    /**
     * Reacts to SUBSTRATES_UPDATED (the service writes server truth into
     * the cache after every mutation). Re-derives the visible list from
     * the cache via the service getters — never triggers a network call.
     */
    async handleSubstratesUpdated() {
      this.substrates = this.isPublic
        ? await SubstrateService.getPublicSubstrates()
        : await SubstrateService.getPrivateSubstrates();
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

        const newSubstrateId =
          await SubstrateService.addSubstrateWithComponents(
            {
              name: payload.meta.name,
              isPublic: payload.meta.isPublic,
            },
            {
              components,
            },
          );

        if (!newSubstrateId) return;

        if (payload.meta.image) {
          // Default refreshCache=true: the upload upserts the substrate
          // (now including the image) and SUBSTRATES_UPDATED repaints.
          await SubstrateService.uploadSubstrateImage(
            newSubstrateId,
            payload.meta.image,
          );
        }

        ToastService.showSuccess({ key: "substrate.added" });
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