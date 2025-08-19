<template>
  <Accordion :item="accordionItem" :showEditButton="false" />
</template>

<script lang="ts">
import { defineComponent, h, markRaw } from "vue";

import Accordion from "@/components/accordion/Accordion.vue";

export default defineComponent({
  name: "CalendarLegend",
  components: {
    Accordion,
  },
  props: {
    legendItems: {
      type: Array as () => { label: string; color: string }[],
      required: true,
    },
  },
  data() {
    return {
      accordionItem: {
        id: "legend",
        name: "Legende",
      } as AccordionItem,
    };
  },
  mounted() {
    this.setLegendComponents();
  },
  methods: {
    setLegendComponents() {
      this.accordionItem.components = this.legendItems.map((item) =>
        markRaw(
          defineComponent({
            name: "InlineLegendItem",
            render() {
              return h("div", { style: { color: item.color } }, item.label);
            },
          })
        )
      );
    },
  },
});
</script>
