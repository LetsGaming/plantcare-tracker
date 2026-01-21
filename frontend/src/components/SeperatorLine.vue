<template>
  <div class="separator-line"></div>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "SeparatorLine",
});
</script>

<style scoped>
.separator-line {
  width: 100%; /* full width */
  height: 4px; /* thickness of the line */
  background-color: var(--ion-color-medium);
  border-radius: 2px; /* rounded ends */
  margin: 16px 0; /* spacing above and below */
  opacity: 0.6; /* slightly faded */
}
</style>
