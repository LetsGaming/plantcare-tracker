<template>
  <ion-page>
    <!-- Custom Header with Filters -->
    <overview-header
      title="Substrate"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        { value: 'private', label: 'Persönlich', icon: personCircle },
      ]"
      :showAddButton="true"
      :addIcon="addCircle"
      starting-segment="private"
      @segment-change="handleSegmentChange"
      @add-click="showAddingModal = true"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="substrates"
        @item-click="navigateToSubstrate"
      ></items-overview>
      <substrate-adding-modal
        :is-open="showAddingModal"
        @close="showAddingModal = false"
        @added="handleSubstrateAdded"
      />
    </ion-content>
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
        console.error("Error fetching substrates:", error);
      }
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
        name: "substrate",
        params: { id: id, public: isPublic_Int },
      });
    },
  },
});
</script>
