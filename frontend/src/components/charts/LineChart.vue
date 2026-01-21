<template>
  <div>
    <Line
      v-if="data"
      :data="data"
      :options="options"
      style="width: 100%; height: 100%"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Line } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Filler,
);

export default defineComponent({
  name: "LineChart",
  components: { Line },
  props: {
    data: {
      type: Object as PropType<ChartData<"line">>,
      required: true, // <-- must be 'data' for vue-chartjs Line
    },
    options: {
      type: Object as PropType<ChartOptions<"line">>,
      required: false,
      default: () => ({}) as ChartOptions<"line">,
    },
  },
});
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
}

/* Target the canvas inside the component */
canvas {
  /* Default text color for light mode */
  color: var(--ion-color-dark-contrast);
  background-color: var(--ion-color-light-tint);
  width: 100% !important;
  height: 100% !important;
}

</style>
