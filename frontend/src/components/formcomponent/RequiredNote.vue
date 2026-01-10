<template>
  <InfoNote note="form.required_field" />
</template>

<script lang="ts">
import { defineComponent } from "vue";
import InfoNote from "@/components/InfoNote.vue";

export default defineComponent({
  name: "RequiredNote",
  components: {
    InfoNote,
  },
});
</script>

<style scoped>
.required-note {
  font-size: 0.75em;
  color: red;
  margin-left: 16px;
}
</style>
