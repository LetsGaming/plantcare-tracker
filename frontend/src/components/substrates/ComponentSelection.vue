<template>
  <ion-card class="component-container align-middle">
    <ion-card-header style="max-width: 100%">
      <ion-title>{{ title }}</ion-title>
      <SearchBar
        placeholder="Komponenten suchen..."
        @search="filterComponents"
      />
    </ion-card-header>

    <ion-card-content style="max-width: 100%">
      <div class="component-list">
        <ion-row>
          <ion-col
            v-for="component in filteredComponents"
            :key="component.id"
            class="component-item"
            size="2"
            size-xs="6"
          >
            <div class="component-content">
              <ion-label>
                <h3>{{ component.name }}</h3>
                <p>Feinheit: {{ component.fineness }}</p>
              </ion-label>
              <div class="component-selection">
                <IonCheckbox
                  :checked="selectedComponentIds.includes(component.id)"
                  @ionChange="toggleSelectedComponent(component.id)"
                />
                <IonInput
                  :disabled="!selectedComponentIds.includes(component.id)"
                  v-model="componentParts[component.id]"
                  type="number"
                  placeholder="Teile"
                  min="0.1"
                />
              </div>
            </div>
          </ion-col>
        </ion-row>
      </div>
    </ion-card-content>
  </ion-card>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardContent,
  IonTitle,
  IonCheckbox,
  IonInput,
  IonRow,
  IonCol,
  IonLabel,
} from "@ionic/vue";
import SearchBar from "@/components/SearchBar.vue";

export default defineComponent({
  name: "ComponentSelection",
  emits: ["toggle-component"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonTitle,
    IonCheckbox,
    IonInput,
    IonRow,
    IonCol,
    IonLabel,
    SearchBar,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    components: {
      type: Array as PropType<SubstrateComponent[]>,
      required: true,
    },
    selectedComponentIds: {
      type: Array as PropType<number[]>,
      required: true,
    },
    componentParts: {
      type: Object as PropType<Record<number, number>>,
      required: true,
    },
  },
  data() {
    return {
      filteredComponents: this.components,
    };
  },
  methods: {
    toggleSelectedComponent(id: number) {
      this.$emit("toggle-component", id);
    },
    // New filtering method using the search query
    filterComponents(query: string) {
      const lowerQuery = query.toLowerCase();
      const filtered = this.components.filter((component) =>
        component.name.toLowerCase().includes(lowerQuery)
      );
      this.filteredComponents = filtered.sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    },
  },
});
</script>

<style scoped>
.component-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.component-selection {
  display: flex;
  align-items: center;
  gap: 12px;
}
ion-label h3 {
  font-size: 18px;
  margin: 0;
}
ion-label p {
  font-size: 14px;
  color: var(--ion-text-color-medium);
  margin: 0;
}
</style>
