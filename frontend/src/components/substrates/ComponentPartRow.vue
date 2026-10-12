<template>
  <li class="part-row" :class="{ selected }">
    <div class="part-line">
      <IonCheckbox
        class="part-pick"
        :checked="selected"
        label-placement="end"
        justify="start"
        @ionChange="$emit('toggle', component.id)"
      >
        <span class="part-name">{{ component.name }}</span>
      </IonCheckbox>

      <div v-if="selected" class="part-input">
        <IonInput
          :value="shownPart"
          :aria-label="`${t('component.selection.placeholder')}: ${component.name}`"
          :placeholder="t('component.selection.placeholder')"
          :class="{ 'part-invalid': error }"
          type="text"
          inputmode="decimal"
          enterkeyhint="done"
          autocomplete="off"
          :aria-invalid="error ? 'true' : undefined"
          @ionInput="onInput"
          @ionBlur="$emit('touch', component.id)"
        />
      </div>
    </div>
    <p class="part-meta">{{ t("component.fineness_prefix") }} {{ component.fineness }}</p>
    <p v-if="error" class="part-error" role="alert">
      {{ t("component.selection.error_positive") }}
    </p>
  </li>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonCheckbox, IonInput } from "@ionic/vue";
import { formatNumber } from "@/utils/enumLabels";
import localizationService from "@/services/general/LocalizationService";

/** One catalogue row of the substrate picker; props are primitives so a part keystroke patches only this row. */
export default defineComponent({
  name: "ComponentPartRow",
  components: { IonCheckbox, IonInput },
  props: {
    component: {
      type: Object as PropType<{ id: number; name: string; fineness: string }>,
      required: true,
    },
    selected: { type: Boolean, default: false },
    part: { type: [Number, String] as PropType<number | string | undefined>, default: undefined },
    error: { type: Boolean, default: false },
  },
  emits: ["toggle", "update-part", "touch"],
  computed: {
    shownPart(): string | undefined {
      return typeof this.part === "number" ? formatNumber(this.part) : this.part;
    },
  },
  methods: {
    onInput(event: CustomEvent) {
      this.$emit("update-part", this.component.id, event.detail.value);
    },
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
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
  border: 1.5px solid var(--control-border);
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
</style>
