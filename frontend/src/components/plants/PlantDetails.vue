<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button text="Zurück"></ion-back-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <div v-if="plant">
        <!-- Full-width banner with dynamic plant image -->
        <section class="plant-banner">
          <ion-img
            :src="plant.imageUrl || '../../public/no-image.png'"
            alt="Plant Image"
            class="plant-banner-image"
          />
          <div class="plant-banner-content">
            <h2 class="plant-name">{{ plant.name }}</h2>
            <p class="plant-species">{{ plant.species }}</p>
          </div>
        </section>

        <section class="plant-info">
          <h3>Substrat</h3>
          <section class="substrate-details">
            <h3 class="substrate-title">
              {{ plant?.substrate?.name ?? 'Unknown' }}
            </h3>
            <ion-accordion-group>
              <ion-accordion>
                <ion-item slot="header" class="component-header">
                  <ion-label>Komponenten</ion-label>
                </ion-item>
                <div slot="content" class="component-wrapper align-middle">
                  <!-- Pie Chart Integration -->
                  <PieChart :data="chartData" v-if="chartData.length > 0" />
                  <div class="component-list">
                    <div class="search-bar">
                      <input
                        v-model="searchQuery"
                        class="search-input"
                        type="text"
                        placeholder="Search components..."
                      />
                    </div>
                    <transition-group
                      name="fade"
                      tag="ul"
                      style="padding: 0; max-height: 250px; overflow-y: scroll"
                    >
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
                            <p>
                              <strong>Fineness:</strong> {{ component.fineness }}
                            </p>
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
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import {
  IonPage,
  IonContent,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonLabel,
  IonImg,
  IonText,
} from "@ionic/vue";
import { defineComponent } from "vue";
import PieChart from "../PieChart.vue";
import PlantService from "@/services/PlantService";

export default defineComponent({
  name: "PlantDetails",
  components: {
    IonPage,
    IonContent,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonLabel,
    IonImg,
    IonText,

    PieChart,
  },
  props: {
    id: {
      type: String,
      required: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      plant: null as null | Plant,
      searchQuery: "",
      detailsVisibility: {} as { [key: number]: boolean },
    };
  },
  async mounted() {
    try {
      this.plant = await PlantService.getPlantById(this.plantId, this.isPublic);
    } catch (error) {
      console.error("Error fetching plant details:", error);
    }
  },
  computed: {
    plantId() {
      return Number.parseInt(this.id);
    },
    components() {
      return this.plant?.substrate?.components ?? [];
    },
    chartData() {
      return this.components.map((component) => ({
        name: `${component.name} - ${component.fineness}`,
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

.plant-banner {
  position: relative;
  width: 100%;
  height: 500px;
  overflow: hidden;
}

.plant-banner-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.plant-banner-content {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.5); /* Dark overlay for readability */
  color: white;
  text-align: left;
}

.plant-name {
  font-size: 2rem;
  font-weight: bold;
  margin: 0;
}

.plant-species {
  font-size: 1.2rem;
  margin-top: 5px;
}

.plant-info {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: var(--card-background-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  transition: background 0.3s ease;
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
  width: 100%;
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