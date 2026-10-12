<template>
  <section class="selection">
    <h3 class="selection-title">{{ t(title) }}</h3>
    <SearchBar :placeholder="t('component.search.placeholder')" @search="filterComponents" />

    <IonItem lines="none" class="only-selected">
      <IonCheckbox v-model="showSelectedOnly" label-placement="end" justify="start">
        {{ t("component.selection.only_selected") }}
      </IonCheckbox>
    </IonItem>

    <div class="selected-block" role="status">
      <p class="selected-count">
        {{ t("components.selected_count", { count: selectedComponents.length }) }}
      </p>
      <ul v-if="selectedComponents.length > 0" class="selected-chips">
        <li v-for="component in selectedComponents" :key="component.id" class="selected-chip">
          {{ component.name }}
        </li>
      </ul>
    </div>

    <ul v-if="filteredComponents.length > 0" class="parts-list">
      <ComponentPartRow
        v-for="component in filteredComponents"
        :key="component.id"
        :component="component"
        :selected="selectedSet.has(component.id)"
        :part="selectedSet.has(component.id) ? componentParts[component.id] : undefined"
        :error="partError(component.id)"
        @toggle="toggleSelectedComponent"
        @update-part="updatePart"
        @touch="touchPart"
      />
    </ul>
    <p v-else class="no-matches">{{ t("subdetail.no_matches") }}</p>
  </section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonCheckbox, IonItem } from "@ionic/vue";
import SearchBar from "@/components/SearchBar.vue";
import ComponentPartRow from "@/components/substrates/ComponentPartRow.vue";
import { parsePart } from "@/utils/substrateParts";
import localizationService from "@/services/general/LocalizationService";

interface PickableComponent {
  id: number;
  name: string;
  fineness: string;
  /** Lowercase search text; the name is searched when absent. */
  searchText?: string;
}

/**
 * Component picker of the substrate form. Rows keep the order of `components`
 * (the store sorts once); selected ones are summarised in the "Selected (n)"
 * block, so ticking never moves a row.
 */
export default defineComponent({
  name: "ComponentSelection",
  emits: ["toggle-component", "update-part"],
  components: {
    IonCheckbox,
    IonItem,
    SearchBar,
    ComponentPartRow,
  },
  props: {
    title: {
      type: String,
      required: true,
    },
    components: {
      type: Array as PropType<readonly PickableComponent[]>,
      required: true,
    },
    selectedComponentIds: {
      type: Array as PropType<number[]>,
      required: true,
    },
    componentParts: {
      type: Object as PropType<Record<number, number | string>>,
      required: true,
    },
    showSelectedOnlyDefault: {
      type: Boolean,
      default: false,
    },
    /** Show part errors for every selected component, not only the ones already visited. */
    showErrors: {
      type: Boolean,
      default: false,
    },
  },
  data() {
    return {
      searchQuery: "",
      showSelectedOnly: this.showSelectedOnlyDefault,
      touched: {} as Record<number, boolean>,
    };
  },
  computed: {
    selectedSet(): ReadonlySet<number> {
      return new Set(this.selectedComponentIds);
    },
    componentsById(): ReadonlyMap<number, PickableComponent> {
      return new Map(this.components.map((component) => [component.id, component]));
    },
    selectedComponents(): PickableComponent[] {
      const known = this.componentsById;
      return this.selectedComponentIds
        .map((id) => known.get(id))
        .filter((component): component is PickableComponent => component !== undefined);
    },
    filteredComponents(): readonly PickableComponent[] {
      const needle = this.searchQuery.trim().toLowerCase();
      let list = this.components;
      if (needle !== "") {
        list = list.filter((component) =>
          (component.searchText ?? component.name.toLowerCase()).includes(needle),
        );
      }
      if (this.showSelectedOnly) {
        const selected = this.selectedSet;
        list = list.filter((component) => selected.has(component.id));
      }
      return list;
    },
  },
  methods: {
    partError(id: number): boolean {
      if (!this.selectedSet.has(id)) return false;
      if (!this.showErrors && !this.touched[id]) return false;
      return parsePart(this.componentParts[id]) === null;
    },
    toggleSelectedComponent(id: number) {
      this.$emit("toggle-component", id);
    },
    updatePart(id: number, value: string) {
      this.$emit("update-part", id, value);
    },
    touchPart(id: number) {
      this.touched[id] = true;
    },
    filterComponents(query: string) {
      this.searchQuery = query;
    },
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
  },
});
</script>

<style scoped>
.selection {
  display: grid;
  gap: var(--space-3);
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

.selection-title {
  font-size: var(--text-lg);
}

.only-selected {
  --padding-start: 0;
}

.selected-block {
  display: grid;
  gap: var(--space-2);
}

.selected-count {
  margin: 0;
  font-weight: 650;
}

.selected-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.selected-chip {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  background: var(--leaf-wash);
  font-size: var(--text-sm);
  overflow-wrap: anywhere;
}

.parts-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1.5px solid var(--control-border);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.no-matches {
  margin: 0;
  color: var(--ink-soft);
}
</style>
