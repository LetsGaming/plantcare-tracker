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
      @add-click="showAddingModal = true"
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
import SubstrateService from "@/services/SubstrateService";
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
  methods: {
    t: (k: string, v?: any) => localizationService.t(k, v),

    async fetchAvailableComponents() {
      try {
        const response = await ComponentService.getAllComponents();
        this.availableComponents = response
          .map((comp: any) => ({
            ...comp,
            description: comp.fineness || "",
            parts: 0,
          }))
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
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
      await this.loadSubstrates(false);
    },
    async refreshSubstrates() {
      await this.loadSubstrates(true);
    },

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchSubstrates();
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
          parts: payload.parts[id] || 1,
        }));

        const response = await SubstrateService.addSubstrateWithComponents(
          {
            name: payload.meta.name,
            isPublic: payload.meta.isPublic,
          },
          {
            substrateId: 0,
            components,
          },
        );

        if (!response) return;

        if (payload.meta.image) {
          await SubstrateService.uploadSubstrateImage(
            response.substrate.substrateId,
            payload.meta.image,
          );
        }

        ToastService.showSuccess({ key: "substrate.added" });
        this.showAddingModal = false;
        await this.fetchSubstrates();
      } catch (error) {
        ToastService.showError({ key: "substrate.add_error" });
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
