<template>
  <div class="pie-chart-wrapper">
    <PieChart :data="chartData" :options="chartOptions" :id="chartId" />
  </div>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Pie } from "vue-chartjs";
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  ArcElement,
  TooltipItem,
} from "chart.js";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
} from "@ionic/vue";

interface ChartData {
  name: string;
  parts: number;
}

ChartJS.register(Title, Tooltip, ArcElement);

export default defineComponent({
  components: {
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    PieChart: Pie,
  },
  props: {
    data: {
      type: Array as PropType<ChartData[]>,
      required: true,
    },
    width: {
      type: Number,
      default: 300, // Default width
    },
    height: {
      type: Number,
      default: 300, // Default height
    },
  },
  data() {
    return {
      chart: undefined as undefined | ChartJS,
      chartData: this.computeChartData(),
      chartOptions: this.computeChartOptions(),
    };
  },
  setup() {
    const chartId = `pie-chart-${Math.random()}`;
    return { chartId };
  },
  mounted() {
    const canvas = document.getElementById(this.chartId) as HTMLCanvasElement;
    this.chart = ChartJS.getChart(canvas);
    if (this.chart) {
      this.chart.resize(this.width, this.height);
    }
  },
  methods: {
    computeChartData() {
      const labels = this.data.map((item) => item.name);
      const parts = this.data.map((item) => item.parts);
      return {
        labels,
        datasets: [
          {
            label: "Parts",
            data: parts,
            backgroundColor: this.getBackgroundColors(parts.length),
            hoverOffset: 4,
          },
        ],
      };
    },
    computeChartOptions() {
      return {
        responsive: true,
        plugins: {
          tooltip: {
            callbacks: {
              label: (tooltipItem: TooltipItem<"pie">) => {
                const label = tooltipItem.label || "";
                const value = tooltipItem.raw || 0;
                return `${label}: ${value}`;
              },
            },
          },
        },
      };
    },
    getBackgroundColors(count: number) {
      const colors: string[] = [];
      for (let i = 0; i < count; i++) {
        colors.push(`hsl(${(i * 360) / count}, 70%, 50%)`);
      }
      return colors;
    },
  },
});
</script>

<style scoped>
.pie-chart-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>