<template>
  <span class="required-mark" aria-hidden="true">*</span>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({ name: "RequiredMark" });
</script>

<style scoped>
.required-mark {
  margin-left: var(--space-1);
  color: var(--ion-color-danger);
  font-weight: 700;
}
</style>
