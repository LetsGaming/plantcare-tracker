<template>
  <ion-page>
    <!-- Custom Header with Filters -->
    <overview-header
      title="Substrates"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        { value: 'private', label: 'Persönlich', icon: personCircle }
      ]"
      :showAddButton="true"
      :addIcon="addCircle"
      :activeSegment="showPublic"
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
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";
import SubstrateService from "@/services/SubstrateService";

// Importing the custom components
import OverviewHeader from "@/components/Overview/OverviewHeader.vue";
import ItemsOverview from "@/components/Overview/ItemsOverview.vue";

export default defineComponent({
  name: "SubstrateOverview",
  components: {
    OverviewHeader,
    ItemsOverview
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
      this.$router.push({ name: "substrate", params: { id } });
    },
    navigateToSubstrateAdding() {
      this.$router.push({ name: "substrate-adding" });
    },
  },
});
</script>
