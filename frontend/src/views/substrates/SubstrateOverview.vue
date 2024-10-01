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
      :onSegmentChange="handleSegmentChange"
      :onAddClick="navigateToSubstrateAdding"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="substrates"
        @item-click="navigateToSubstrate"
      ></items-overview>
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

export default defineComponent({
  name: "SubstrateOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      substrates: [] as Substrate[],
      showPublic: "private",
    };
  },
  setup() {
    return {
      peopleCircle,
      personCircle,
      addCircle,
    };
  },
  mounted() {
    this.fetchSubstrates();
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
    navigateToSubstrate(id: number) {
      this.$router.push({ name: "substrate", params: { id: id, public: 1 } });
    },
    navigateToSubstrateAdding() {
      this.$router.push({ name: "substrate-adding" });
    },
  },
});
</script>
