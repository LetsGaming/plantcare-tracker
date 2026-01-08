<template>
  <ion-page>
    <!-- Custom Header with Filters -->
    <overview-header
      title="Substrate"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        {
          value: 'private',
          label: 'Persönlich',
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
    /**
     * Unified logic for fetching and refreshing substrates
     */
    async loadSubstrates(isRefresh = false) {
      const labels = {
        type: this.isPublic ? "öffentliche" : "persönliche",
        typeGen: this.isPublic ? "öffentlicher" : "persönlicher",
        notFound: this.isPublic ? "Keine öffentlichen Substrate verfügbar." : "Keine persönlichen Substrate gefunden."
      };

      try {
        this.substrates = await SubstrateService.getSubstrates(this.isPublic, isRefresh);

        if (this.substrates.length === 0) {
          ToastService.showWarning(labels.notFound);
        } else if (isRefresh) {
          // Capitalize first letter for the success message
          const typeCap = labels.type.charAt(0).toUpperCase() + labels.type.slice(1);
          ToastService.showSuccess(`${typeCap} Substrate aktualisiert.`);
        }
      } catch (error) {
        ToastService.showError(`Fehler beim Abrufen ${labels.typeGen} Substrate.`);
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
