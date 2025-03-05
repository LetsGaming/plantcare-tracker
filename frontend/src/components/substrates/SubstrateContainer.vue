<template>
  <ion-card v-if="substrate">
    <ion-card-header>
      <ion-toolbar>
        <ion-title>Substrat</ion-title>
      </ion-toolbar>
    </ion-card-header>

    <section class="substrate-details">
      <ion-card-header>
        <ion-card-title class="substrate-title">
          {{ substrate.name ?? "Unknown" }}
        </ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-accordion-group>
          <ion-accordion>
            <ion-item slot="header" class="component-header">
              <ion-label>Komponenten</ion-label>
            </ion-item>
            <div slot="content" class="component-wrapper align-middle">
              <!-- Pie Chart Integration -->
              <PieChart :data="chartData" v-if="chartData.length > 0" />
              <div class="component-list">
                <!-- Updated Search Bar Integration -->
                <SearchBar
                  placeholder="Search components..."
                  @search="filterComponents"
                />
                <CustomAccordion :items="filteredComponents" />
              </div>
            </div>
          </ion-accordion>
        </ion-accordion-group>
      </ion-card-content>
    </section>
  </ion-card>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonAccordion,
  IonAccordionGroup,
  IonItem,
  IonLabel,
  IonToolbar,
  IonTitle,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
} from "@ionic/vue";
import PieChart from "@/components/PieChart.vue";
import SearchBar from "@/components/SearchBar.vue";
import CustomAccordion from "../CustomAccordion.vue";

export default defineComponent({
  components: {
    IonAccordion,
    IonAccordionGroup,
    IonItem,
    IonLabel,
    IonToolbar,
    IonTitle,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    PieChart,
    SearchBar,
    CustomAccordion,
  },
  props: {
    substrate: {
      type: Object as () => Substrate,
    },
  },
  data() {
    return {
      filteredComponents: [] as AccordionItem[],
      detailsVisibility: {} as { [key: number]: boolean },
    };
  },
  mounted() {
    // Initialize with the full list (converted to accordion items) on mount
    this.filteredComponents = this.mapComponentsToAccordion(this.components);
  },
  computed: {
    components() {
      // Sort components by parts first, then by name alphabetically
      return (this.substrate?.components ?? []).sort((a, b) => {
        if (a.parts !== b.parts) {
          return a.parts - b.parts;
        }
        return a.name.localeCompare(b.name);
      });
    },
    chartData() {
      return this.components.map((component) => ({
        name: `${component.name} - ${component.fineness}`,
        parts: component.parts,
      }));
    },
  },
  methods: {
    // New filtering method using the search query
    filterComponents(query: string) {
      const lowerQuery = query.toLowerCase();
      const filtered = this.components.filter((component) =>
        component.name.toLowerCase().includes(lowerQuery)
      );
      const sortedFiltered = filtered.sort((a, b) => {
        if (a.parts !== b.parts) {
          return a.parts - b.parts;
        }
        return a.name.localeCompare(b.name);
      });
      this.filteredComponents = this.mapComponentsToAccordion(sortedFiltered);
    },
    mapComponentsToAccordion(components: SubstrateComponent[]) {
      return components.map((component) => ({
        id: component.id,
        name: component.name,
        details: {
          Teile: component.parts,
          Feinheit: component.fineness,
        },
      }));
    },
    toggleDetails(id: number) {
      this.detailsVisibility = {
        ...this.detailsVisibility,
        [id]: !this.detailsVisibility[id],
      };
    },
    isDetailsVisible(id: number) {
      return !!this.detailsVisibility[id];
    },
  },
});
</script>

<style scoped>
:root {
  --background-color: var(--ion-color-light);
  --card-background-color: var(--ion-color-white);
  --header-background-color: var(--ion-color-light-tint);
  --text-color: var(--ion-color-dark);
  --detail-text-color: var(--ion-color-medium);
  --accent-color: var(--ion-color-primary);
}
.card {
  background: var(--card-background-color);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}
.card:hover {
  transform: translateY(-5px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
}
.substrate-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.substrate-title {
  font-weight: 500;
  color: var(--detail-text-color);
  font-size: 1.2rem;
  -webkit-padding-start: 20px;
  padding-inline-start: 20px;
  -webkit-padding-end: 20px;
  padding-inline-end: 20px;
}
.component-header {
  background: var(--header-background-color);
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.2rem;
}
.component-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
