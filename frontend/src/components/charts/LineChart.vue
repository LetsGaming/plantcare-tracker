<template>
  <Line
    v-if="chartData"
    :data="chartData"
    :options="chartOptions"
    style="width: 100%; height: 100%"
  />
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

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

export default defineComponent({
  name: "LineChart",
  components: { Line },

  props: {
    data: {
      type: Object as PropType<ChartData<"line">>,
      required: true,
    },
    options: {
      type: Object as PropType<ChartOptions<"line">>,
      default: () => ({}),
    },
  },

  data() {
    return {
      chartData: null as ChartData<"line"> | null,
      chartOptions: undefined as ChartOptions<"line"> | undefined,
      observer: null as MutationObserver | null,
    };
  },

  mounted() {
    this.applyTheme();
    this.observePalette();
  },

  beforeUnmount() {
    this.observer?.disconnect();
  },

  watch: {
    data: {
      deep: true,
      handler() {
        this.applyTheme();
      },
    },
  },
  methods: {
    computeYAxisBounds(values: number[]) {
      const min = Math.min(...values);
      const max = Math.max(...values);

      const range = max - min || min * 0.05;
      const padding = range * 0.25;

      return {
        min: +(min - padding).toFixed(2),
        max: +(max + padding).toFixed(2),
      };
    },
    applyTheme() {
      const lineColor = cssVar("--chart-line-color");
      const fillColor = cssVar("--chart-fill-color");
      const textColor = cssVar("--chart-text-color");
      const gridColor = cssVar("--chart-grid-color");

      const values = this.data.datasets[0].data as number[];
      const { min, max } = this.computeYAxisBounds(values);
      console.log({ min, max });
      this.chartData = {
        ...this.data,
        datasets: this.data.datasets.map((ds) => ({
          ...ds,
          borderColor: lineColor,
          backgroundColor: fillColor,
          pointBackgroundColor: lineColor,
          pointBorderColor: lineColor,
          fill: true,
          tension: 0.3,
        })),
      };

      this.chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            titleColor: textColor,
            bodyColor: textColor,
            callbacks: {
              label: (ctx) => {
                const y = ctx.parsed?.y ?? null;
                return y == null ? "" : `${Number(y).toFixed(2)} €`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: 6 },
            grid: { color: gridColor },
          },
          y: {
            min,
            max,
            ticks: {
              color: textColor,
              maxTicksLimit: 5,
              callback: (value) => `${Number(value).toFixed(2)} €`,
            },
            grid: { color: gridColor },
          },
        },
        ...this.options,
      };
    },
    observePalette() {
      this.observer = new MutationObserver(() => {
        this.applyTheme();
      });

      this.observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    },
  },
});
</script>
