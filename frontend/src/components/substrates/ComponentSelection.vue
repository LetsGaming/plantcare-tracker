<template>
  <ion-card class="component-container align-middle">
    <ion-card-header style="max-width: 100%">
      <ion-title>{{ t(title, undefined, title) }}</ion-title>
      <SearchBar
        :placeholder="t('component.search.placeholder')"
        @search="filterComponents"
      />
        <div class="selected-only-toggle">
        <IonCheckbox v-model="showSelectedOnly" />
        <ion-label>{{ t('component.selection.only_selected') }}</ion-label>
      </div>
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
                <p>{{ t('component.fineness_prefix') }} {{ component.fineness }}</p>
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
                  :placeholder="t('component.selection.placeholder')"
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
import Utils from "@/utils/utils";
import localizationService from '@/services/general/LocalizationService'

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
    showSelectedOnlyDefault: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      searchQuery: "",
      showSelectedOnly: this.showSelectedOnlyDefault,
    };
  },
  computed: {
    filteredComponents(): SubstrateComponent[] {
      let list = this.components;

      list = Utils.baseSearchFilter(this.searchQuery, list);

      if (this.showSelectedOnly) {
        list = list.filter((component) =>
          this.selectedComponentIds.includes(component.id)
        );
      }

      return list.sort((a, b) => {
        const aSelected = this.selectedComponentIds.includes(a.id);
        const bSelected = this.selectedComponentIds.includes(b.id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return a.name.localeCompare(b.name);
      });
    },
  },
  methods: {
    toggleSelectedComponent(id: number) {
      this.$emit("toggle-component", id);
    },
    filterComponents(query: string) {
      this.searchQuery = query;
    },
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback)
    }
  },
});
</script>

<style scoped>
.component-container {
  margin: 10px !important;
}

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
.selected-only-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-left: 5px;
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
