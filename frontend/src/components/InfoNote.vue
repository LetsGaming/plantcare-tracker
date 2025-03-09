<template>
  <small class="info-note">{{ note }}</small>
</template>

<script lang="ts">
import { defineComponent } from "vue";

export default defineComponent({
  name: "InfoNote",
  props: {
    note: {
      type: String,
      required: true,
    },
  },
});
</script>
<style scoped>
.info-note {
  font-size: 12px;
  color: red;
}
</style>
