<template>
  <ion-page>
    <!-- Sticky Header with Filters -->
    <overview-header
      title="Plants"
      :segments="[
        { value: 'public', label: 'Öffentlich', icon: peopleCircle },
        { value: 'private', label: 'Persönlich', icon: personCircle },
      ]"
      :showAddButton="true"
      :addIcon="addCircle"
      starting-segment="private"
      :onSegmentChange="handleSegmentChange"
      :onAddClick="navigateToComponentAdding"
    />

    <!-- Content Area -->
    <ion-content>
      <items-overview
        :items="components"
        @item-click="navigateToComponent"
      ></items-overview>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonContent, IonPage } from "@ionic/vue";
import { peopleCircle, personCircle, addCircle } from "ionicons/icons";

import ComponentService from "@/services/ComponentService";

// Importing the new custom components
import OverviewHeader from "@/components/overview/OverviewHeader.vue";
import ItemsOverview from "@/components/overview/ItemsOverview.vue";

export default defineComponent({
  name: "PlantOverview",
  components: {
    IonPage,
    IonContent,

    OverviewHeader,
    ItemsOverview,
  },
  data() {
    return {
      components: [] as Component[],
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
    this.fetchComponents();
  },
  computed: {
    isPublic() {
      return this.showPublic === "public";
    },
  },
  methods: {
    async fetchComponents() {
      try {
        this.components = await ComponentService.getComponents();
      } catch (error) {
        console.error("Error fetching plants:", error);
      }
    },
    handleSegmentChange(value: string) {
      this.showPublic = value;
      this.fetchComponents(); // Refetch plants based on segment change
    },
    navigateToComponent(id: number) {
      this.$router.push({ name: "component", params: { id } });
    },
    navigateToComponentAdding() {
      this.$router.push({ name: "component-adding" });
    },
  },
});
</script>
