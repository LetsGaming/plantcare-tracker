<template>
  <ion-page>
    <!-- Custom Header with Filters -->
    <overview-header
      :title="t('substrate.title')"
      :segments="[
        { value: 'public', label: t('substrate.public_label'), icon: peopleCircle },
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

    <!-- Content Area -->
    <items-overview
      :items="substrates"
      @item-click="navigateToSubstrate"
      @refresh-items="refreshSubstrates"
    ></items-overview>
    <substrate-adding-modal
      :is-open="showAddingModal"
      @close="showAddingModal = false"
      @added="handleSubstrateAdded"
    />
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";
import SubstrateService from "@/services/SubstrateService";
import localizationService from "@/services/general/LocalizationService";

// Importing the custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";
import SubstrateAddingModal from "@/components/substrates/SubstrateAddingModal.vue";
import ToastService from "@/services/general/ToastService";

export default defineComponent({
  name: "SubstrateOverview",
  components: {
    IonPage,
    IonContent,
    OverviewHeader,
    ItemsOverview,
    SubstrateAddingModal,
  },
  data() {
    return {
      substrates: [] as Substrate[],
      showPublic: "private",
      showAddingModal: false,
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
    };
  },
  async ionViewWillEnter() {
    await this.fetchSubstrates();
  },
  computed: {
    isPublic() {
      return this.showPublic === "public";
    },
  },
methods: {
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    /**
     * Unified logic for fetching and refreshing substrates
     */
    async loadSubstrates(isRefresh = false) {
      try {
        this.substrates = await SubstrateService.getSubstrates(this.isPublic, isRefresh);

        if (this.substrates.length === 0) {
          const key = this.isPublic ? 'substrate.empty_public' : 'substrate.empty_private';
          ToastService.showWarning({ key });
        } else if (isRefresh) {
          const typeLabel = this.isPublic ? this.t('substrate.public_label') : this.t('substrate.private_label');
          ToastService.showSuccess({ key: 'substrate.refreshed', vars: { type: typeLabel } });
        }
      } catch (error) {
        const typeLabel = this.isPublic ? this.t('substrate.public_label') : this.t('substrate.private_label');
        ToastService.showError({ key: 'substrate.fetch_error', vars: { type: typeLabel } });
        console.error(`Error ${isRefresh ? 'refreshing' : 'fetching'} substrates:`, error);
      }
    },

    // Shorthands for template use
    async fetchSubstrates() { await this.loadSubstrates(false); },
    async refreshSubstrates() { await this.loadSubstrates(true); },

    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchSubstrates();
    },

    async handleSubstrateAdded() {
      this.showAddingModal = false;
      await this.fetchSubstrates();
    },

    navigateToSubstrate(id: number) {
      this.$router.push({
        name: "substrate-details",
        params: {
          id,
          public: this.isPublic ? 1 : 0
        },
      });
    },
  },
});
</script>
