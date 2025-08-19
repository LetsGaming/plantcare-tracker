<template>
  <transition-group name="fade" tag="ul" class="accordion-list">
    <Accordion v-for="item in items" :key="item.id" :item="item" />
  </transition-group>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import Accordion from "@/components/accordion/Accordion.vue";

export default defineComponent({
  name: "AccordionList",
  components: { Accordion },
  props: {
    items: {
      type: Array as PropType<AccordionItem[]>,
      required: true,
    },
  },
});
</script>

<style scoped>
.accordion-list {
  padding-left: 15px;
  padding-right: 15px;
  max-height: 250px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
