<template>
  <section class="selection">
    <h3 class="selection-title">{{ t(title) }}</h3>
    <SearchBar :placeholder="t('component.search.placeholder')" @search="filterComponents" />

    <IonItem lines="none" class="only-selected">
      <IonCheckbox v-model="showSelectedOnly" label-placement="end" justify="start">
        {{ t("component.selection.only_selected") }}
      </IonCheckbox>
    </IonItem>

    <ul class="parts-list">
      <li
        v-for="component in filteredComponents"
        :key="component.id"
        class="part-row"
        :class="{ selected: isSelected(component.id) }"
      >
        <div class="part-pick">
          <IonCheckbox
            :checked="isSelected(component.id)"
            label-placement="end"
            justify="start"
            @ionChange="toggleSelectedComponent(component.id)"
          >
            <span class="part-name">{{ component.name }}</span>
            <span class="part-meta">
              {{ t("component.fineness_prefix") }} {{ component.fineness }}
            </span>
          </IonCheckbox>
        </div>

        <div class="part-input">
          <IonInput
            :value="componentParts[component.id]"
            :disabled="!isSelected(component.id)"
            :aria-label="`${t('component.selection.placeholder')}: ${component.name}`"
            :placeholder="
              isSelected(component.id)
                ? t('component.selection.placeholder')
                : t('component.selection.disabled_hint')
            "
            :class="{ 'part-invalid': partError(component.id) }"
            type="text"
            inputmode="decimal"
            enterkeyhint="done"
            autocomplete="off"
            :aria-invalid="partError(component.id) ? 'true' : undefined"
            @ionInput="updatePart(component.id, $event)"
            @ionBlur="touched[component.id] = true"
          />
          <p v-if="partError(component.id)" class="part-error" role="alert">
            {{ t("component.selection.error_positive") }}
          </p>
        </div>
      </li>
    </ul>
  </section>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonCheckbox, IonInput, IonItem } from "@ionic/vue";
import SearchBar from "@/components/SearchBar.vue";
import Utils from "@/utils/utils";
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
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.part-row {
  display: grid;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
}

.part-row.selected {
  border-color: var(--ion-color-primary);
  background: var(--leaf-wash);
}

.part-name {
  display: block;
  font-weight: 650;
}

.part-meta {
  display: block;
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.part-input ion-input {
  min-height: var(--tap-min);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  --padding-start: var(--space-3);
  background: var(--surface-raised);
}

.part-input ion-input.part-invalid {
  border-color: var(--ion-color-danger);
}

.part-error {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--ion-color-danger);
}
</style>
