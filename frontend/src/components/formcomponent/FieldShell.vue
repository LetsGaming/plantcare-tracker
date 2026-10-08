<template>
  <div class="field-shell">
    <component
      :is="labelTag"
      :id="labelId"
      class="field-label"
      :for="labelFor || undefined"
      @click="$emit('label-click')"
    >
      <slot name="label">{{ label }}</slot>
      <RequiredMark v-if="required" />
    </component>
    <div v-if="boxed" class="field-box" :class="{ 'field-box-invalid': !!error }">
      <slot />
    </div>
    <slot v-else />
    <FieldError :id="messageId" :message="error" :hint="hint" />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import FieldError from "@/components/formcomponent/FieldError.vue";
import RequiredMark from "@/components/formcomponent/RequiredMark.vue";

/** The one frame every field type sits in: label above, 44px outlined control, hint or error below. */
export default defineComponent({
  name: "FieldShell",
  components: { FieldError, RequiredMark },
  emits: ["label-click"],
  props: {
    label: { type: String, default: "" },
    required: { type: Boolean, default: false },
    error: { type: String, default: "" },
    hint: { type: String, default: "" },
    messageId: { type: String, required: true },
    labelId: { type: String, default: undefined },
    /** DOM id of the control the label names; leave empty for groups. */
    labelFor: { type: String, default: "" },
    labelTag: { type: String as PropType<"label" | "span">, default: "span" },
    /** Draw the outlined box around the slot; groups that frame themselves turn this off. */
    boxed: { type: Boolean, default: true },
  },
});
</script>

<style scoped>
.field-shell {
  margin-bottom: var(--space-4);
}

.field-label {
  display: block;
  margin-bottom: var(--space-2);
  color: var(--ion-text-color);
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.field-box {
  box-sizing: border-box;
  min-height: var(--tap-min);
  border: 1.5px solid color-mix(in srgb, var(--ink-soft) 60%, var(--line));
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  transition: border-color 0.15s var(--ease-out);
}

.field-box :slotted(ion-input),
.field-box :slotted(ion-select),
.field-box :slotted(ion-textarea) {
  --padding-start: var(--space-3);
  --padding-end: var(--space-3);
  --padding-top: 0;
  --padding-bottom: 0;
  --background: transparent;
  --highlight-color-focused: transparent;
  --highlight-color-valid: transparent;
  --highlight-color-invalid: transparent;
  --placeholder-color: var(--ink-soft);
  --placeholder-opacity: 1;
  min-height: calc(var(--tap-min) - 3px);
  font-size: var(--text-md);
  color: var(--ion-text-color);
}

.field-box :slotted(ion-textarea) {
  --padding-top: var(--space-3);
  --padding-bottom: var(--space-3);
}

.field-box:focus-within {
  border-color: var(--focus-ring);
  outline: 2px solid var(--focus-ring);
  outline-offset: 0;
}

.field-box-invalid,
.field-box-invalid:focus-within {
  border-color: var(--ion-color-danger);
  outline-color: var(--ion-color-danger);
}
</style>

<style>
.field-box ion-select::part(placeholder),
.field-box ion-select::part(text) {
  color: var(--ink-soft);
  opacity: 1;
}

.field-box ion-select::part(text) {
  color: var(--ion-text-color);
}

.field-box ion-select::part(placeholder) {
  color: var(--ink-soft);
}
</style>
