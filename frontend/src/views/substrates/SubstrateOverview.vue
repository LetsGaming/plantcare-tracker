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
    async fetchSubstrates() {
      try {
        this.substrates = await SubstrateService.getSubstrates(this.isPublic);
      } catch (error) {
        this.showError();
        console.error("Error fetching substrates:", error);
      }
    },
    async refreshSubstrates() {
      try {
        this.substrates = await SubstrateService.getSubstrates(
          this.isPublic,
          true
        );
        if (this.substrates.length === 0) {
          ToastService.showError(
            this.isPublic
              ? "Öffentliche Substrate sind nicht verfügbar."
              : "Keine persönlichen Substrate gefunden."
          );
        } else {
          ToastService.showSuccess(
            this.isPublic
              ? "Öffentliche Substrate aktualisiert."
              : "Persönliche Substrate aktualisiert."
          );
        }
      } catch (error) {
        this.showError();
        console.error("Error refreshing substrates:", error);
      }
    },
    showError() {
      ToastService.showError(
        this.isPublic
          ? "Fehler beim Abrufen öffentlicher Substrate."
          : "Fehler beim Abrufen persönlicher Substrate."
      );
    },
    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchSubstrates(); // Refetch substrates based on segment change
    },
    async handleSubstrateAdded() {
      this.showAddingModal = false;
      await this.fetchSubstrates();
    },
    navigateToSubstrate(id: number) {
      const isPublic_Int = this.isPublic ? 1 : 0;
      this.$router.push({
        name: "substrates-details",
        params: { id: id, public: isPublic_Int },
      });
    },
  },
});
</script>
