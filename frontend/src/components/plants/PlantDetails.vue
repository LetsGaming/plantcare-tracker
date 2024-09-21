<template>
  <!-- Selected Plant Details -->
  <div v-if="selectedPlant" class="plant-details">
    <h2>{{ selectedPlant.name }}</h2>
    <p><strong>Species:</strong> {{ selectedPlant.species }}</p>

    <!-- Plant Components Accordion -->
    <ion-accordion-group>
      <ion-accordion>
        <ion-item slot="header">
          <ion-label>Components</ion-label>
        </ion-item>

        <ion-item slot="content">
          <!-- Component List with details -->
          <div class="components-wrapper">
            <ion-row>
              <ion-col
                v-for="component in selectedPlant.substrate.components"
                :key="component.id"
                class="component-card"
                size="6"
              >
                <ion-card>
                  <ion-card-header>
                    <ion-card-title>{{ component.name }}</ion-card-title>
                  </ion-card-header>
                  <ion-card-content>
                    <ion-list slot="content">
                      <ion-item>
                        <ion-label>
                          <strong>Fineness:</strong>
                          {{ component.fineness }}
                        </ion-label>
                      </ion-item>
                      <ion-item>
                        <ion-label>
                          <strong>Parts:</strong> {{ component.parts }}
                        </ion-label>
                      </ion-item>
                    </ion-list>
                  </ion-card-content>
                </ion-card>
              </ion-col>
            </ion-row>
          </div>
        </ion-item>
      </ion-accordion>
    </ion-accordion-group>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonAccordionGroup,
  IonAccordion,
  IonItem,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonLabel,
} from "@ionic/vue";
export default defineComponent({
  name: "PlantDetails",
  props: {
    selectedPlant: {
      type: Object as () => Plant | null,
    },
  },
  components: {
    IonAccordionGroup,
    IonAccordion,
    IonItem,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonLabel,
  },
});
</script>

<style scoped>
.plant-details {
  padding: 16px;
}

.components-wrapper {
  width: 100%;
}

.component-card {
  margin-top: 10px;
}
</style>
