<template>
  <section class="selection">
    <h3 class="selection-title">{{ t(title) }}</h3>
    <SearchBar :placeholder="t('component.search.placeholder')" @search="filterComponents" />

    <IonItem lines="none" class="only-selected">
      <IonCheckbox v-model="showSelectedOnly" label-placement="end" justify="start">
        {{ t("component.selection.only_selected") }}
      </IonCheckbox>
    </IonItem>

    <ul v-if="filteredComponents.length > 0" class="parts-list">
      <li
        v-for="component in filteredComponents"
        :key="component.id"
        class="part-row"
        :class="{ selected: isSelected(component.id) }"
      >
        <div class="part-line">
          <IonCheckbox
            class="part-pick"
            :checked="isSelected(component.id)"
            label-placement="end"
            justify="start"
            @ionChange="toggleSelectedComponent(component.id)"
          >
            <span class="part-name">{{ component.name }}</span>
          </IonCheckbox>

          <div v-if="isSelected(component.id)" class="part-input">
            <IonInput
              :value="displayPart(componentParts[component.id])"
              :aria-label="`${t('component.selection.placeholder')}: ${component.name}`"
              :placeholder="t('component.selection.placeholder')"
              :class="{ 'part-invalid': partError(component.id) }"
              type="text"
              inputmode="decimal"
              enterkeyhint="done"
              autocomplete="off"
              :aria-invalid="partError(component.id) ? 'true' : undefined"
              @ionInput="updatePart(component.id, $event)"
              @ionBlur="touched[component.id] = true"
            />
          </div>
        </div>
        <p class="part-meta">
          {{ t("component.fineness_prefix") }} {{ finenessLabel(component.fineness) }}
        </p>
        <p v-if="partError(component.id)" class="part-error" role="alert">
          {{ t("component.selection.error_positive") }}
        </p>
      </li>
    </ul>
    <p v-else class="no-matches">{{ t("subdetail.no_matches") }}</p>
  </section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonCheckbox, IonInput, IonItem } from "@ionic/vue";
import SearchBar from "@/components/SearchBar.vue";
import Utils from "@/utils/utils";
import { finenessLabel, formatNumber } from "@/utils/enumLabels";
import { parsePart } from "@/utils/substrateParts";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "ComponentSelection",
  emits: ["toggle-component", "update-part"],
  components: {
    IonCheckbox,
    IonInput,
    IonItem,
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
    filteredComponents(): SubstrateComponent[] {
      let list = Utils.baseSearchFilter(this.searchQuery, this.components);

      if (this.showSelectedOnly) {
        list = list.filter((component) => this.selectedComponentIds.includes(component.id));
      }

      return [...list].sort((a, b) => {
        const aSelected = this.selectedComponentIds.includes(a.id);
        const bSelected = this.selectedComponentIds.includes(b.id);
        if (aSelected && !bSelected) return -1;
        if (!aSelected && bSelected) return 1;
        return a.name.localeCompare(b.name);
      });
    },
  },
  methods: {
    displayPart(value: string | number | undefined): string | number | undefined {
      return typeof value === "number" ? formatNumber(value) : value;
    },
    finenessLabel,
    isSelected(id: number): boolean {
      return this.selectedComponentIds.includes(id);
    },
    partError(id: number): boolean {
      if (!this.isSelected(id)) return false;
      if (!this.showErrors && !this.touched[id]) return false;
      return parsePart(this.componentParts[id]) === null;
    },
    toggleSelectedComponent(id: number) {
      this.$emit("toggle-component", id);
    },
    updatePart(id: number, event: CustomEvent) {
      this.$emit("update-part", id, event.detail.value);
    },
    filterComponents(query: string) {
      this.searchQuery = query;
    },
    t(key: string) {
      return localizationService.t(key, undefined, key);
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

.parts-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  list-style: none;
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.part-row {
  padding: var(--space-1) var(--space-3);
}

.part-row + .part-row {
  border-top: 1px solid var(--line);
}

.part-row.selected {
  background: var(--leaf-wash);
}

.part-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: var(--tap-min);
}

.part-pick {
  flex: 1;
  min-width: 0;
}

.part-name {
  font-weight: 650;
  overflow-wrap: anywhere;
}

.part-pick::part(label) {
  white-space: normal;
}

.part-meta {
  margin: calc(var(--space-2) * -1) 0 var(--space-2);
  padding-inline-start: calc(var(--space-6) + var(--space-1));
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.part-input {
  flex: none;
  width: 7rem;
}

.part-input ion-input {
  min-height: calc(var(--tap-min) - 4px);
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-sm);
  background: var(--surface-raised);
  --padding-start: var(--space-3);
  --padding-end: var(--space-3);
  --placeholder-color: var(--ink-soft);
  --placeholder-opacity: 1;
}

.part-input ion-input.part-invalid {
  border-color: var(--ion-color-danger);
}

.part-error {
  margin: 0 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ion-color-danger);
}

.no-matches {
  margin: 0;
  color: var(--ink-soft);
}
</style>
