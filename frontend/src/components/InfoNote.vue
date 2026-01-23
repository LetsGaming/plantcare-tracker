<template>
  <small class="info-note">{{ t(note) }}</small>
</template>

<script lang="ts">
import localizationService from "@/services/general/LocalizationService";
import { defineComponent } from "vue";

export default defineComponent({
  name: "InfoNote",
  props: {
    note: {
      type: String,
      required: true,
    },
  },
  methods: {
    t(key: string | undefined, vars?: Record<string, string>, fallback?: string) {
      return localizationService.t(key || '', vars, fallback || key || '');
    }
  },
});
</script>
<style scoped>
.info-note {
  display: block;
  font-size: 12px;
  color: red;
}
</style>
