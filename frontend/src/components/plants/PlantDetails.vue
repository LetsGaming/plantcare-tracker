<template>
  <div v-if="selectedPlant" class="plant-details">
    <section class="plant-info">
      <h2 class="plant-name">{{ selectedPlant.name }}</h2>
      <p class="plant-species">
        <strong>Species:</strong> {{ selectedPlant.species }}
      </p>
    </section>

    <section class="substrate-details">
      <h3 class="substrate-title">
        {{ selectedPlant?.substrate?.name ?? "Unknown" }}
      </h3>
      <ion-accordion-group>
        <ion-accordion>
          <ion-item slot="header" class="component-header">
            <ion-label>Components</ion-label>
          </ion-item>
          <div slot="content">
            <!-- Pie Chart Integration -->
            <PieChart :data="chartData" v-if="chartData.length > 0" />
            <div class="search-bar">
              <input
                v-model="searchQuery"
                class="search-input"
                type="text"
                placeholder="Search components..."
              />
            </div>
            <div class="component-list">
              <transition-group name="fade" tag="ul">
                <li
                  v-for="component in filteredComponents"
                  :key="component.id"
                  class="component-item card"
                >
                  <button
                    class="component-toggle"
                    @click="toggleDetails(component.id)"
                    :aria-expanded="isDetailsVisible(component.id)"
                  >
                    <span class="component-name">{{ component.name }}</span>
                    <span
                      class="toggle-icon"
                      :class="{ open: isDetailsVisible(component.id) }"
                    >
                      ▼
                    </span>
                  </button>

                  <transition name="slide-fade">
                    <div
                      v-if="isDetailsVisible(component.id)"
                      class="component-details"
                    >
                      <p><strong>Fineness:</strong> {{ component.fineness }}</p>
                      <p><strong>Parts:</strong> {{ component.parts }}</p>
                    </div>
                  </transition>
                </li>
              </transition-group>
            </div>
          </div>
        </ion-accordion>
      </ion-accordion-group>
    </section>
  </div>
</template>

<script lang="ts">
import { IonAccordionGroup, IonAccordion, IonItem, IonLabel } from "@ionic/vue";
import { defineComponent } from "vue";
import PieChart from "../PieChart.vue";

export default defineComponent({
  name: "PlantDetails",
  components: {
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    PieChart,
  },
  props: {
    selectedPlant: {
      type: Object as () => Plant | null,
      required: false,
    },
  },
  data() {
    return {
      searchQuery: "",
      detailsVisibility: {} as { [key: number]: boolean },
    };
  },
  computed: {
    components() {
      return this.selectedPlant?.substrate?.components ?? [];
    },
    chartData() {
      return this.components.map((component) => ({
        name: component.name,
        parts: component.parts,
      }));
    },
    filteredComponents() {
      return this.components.filter((component) =>
        component.name.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    },
  },
  methods: {
    toggleDetails(id: number) {
      // Directly assign the value to the detailsVisibility object
      this.detailsVisibility = {
        ...this.detailsVisibility, // Keep the existing state
        [id]: !this.detailsVisibility[id], // Toggle the visibility for the specific component ID
      };
    },
    isDetailsVisible(id: number) {
      return !!this.detailsVisibility[id];
    },
  }
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

.plant-details {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transition: background 0.3s ease;
}

.plant-info,
.substrate-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.plant-name {
  font-size: 28px;
  font-weight: bold;
  color: var(--text-color);
}

.plant-species,
.substrate-title {
  font-weight: 500;
  color: var(--detail-text-color);
  font-size: 1.1rem;
}

.search-bar {
  padding: 10px 0;
}

.search-input {
  width: 100%;
  padding: 10px;
  font-size: 1rem;
  border-radius: 8px;
  border: 1px solid var(--ion-color-light);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.component-header {
  background: var(--header-background-color);
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.2rem;
}

.component-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.component-item {
  list-style: none;
  padding: 15px;
  border-bottom: 1px solid var(--ion-color-light);
}

.component-toggle {
  width: 100%;
  background: none;
  border: none;
  text-align: left;
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  font-size: 1rem;
  cursor: pointer;
  transition: color 0.3s ease;
  padding: 10px 0;
}

.component-toggle:focus {
  outline: 2px solid var(--accent-color);
}

.component-toggle:hover {
  color: var(--accent-color);
}

.toggle-icon {
  transition: transform 0.3s ease;
}

.toggle-icon.open {
  transform: rotate(180deg);
}

.component-details {
  margin-top: 10px;
  padding-left: 20px;
  font-size: 0.9rem;
  color: var(--detail-text-color);
  background-color: var(--ion-color-dark-shade);
  border-radius: 6px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
