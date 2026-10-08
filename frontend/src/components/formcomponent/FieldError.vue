<template>
  <p v-if="message" :id="id" class="field-error" role="alert">{{ message }}</p>
  <p v-else-if="hint" :id="id" class="field-hint">{{ hint }}</p>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "FieldError",
  props: {
    id: { type: String, required: true },
    message: { type: String, default: "" },
    hint: { type: String, default: "" },
  },
});
</script>

<style scoped>
.field-error,
.field-hint {
  margin: var(--space-1) var(--space-3) 0;
  font-size: var(--text-xs);
  line-height: 1.35;
  white-space: pre-line;
}

.field-error {
  color: var(--ion-color-danger);
  font-weight: 600;
}

.field-hint {
  color: var(--ink-soft);
}
</style>
