<template>
  <div class="price-history-chart">
    <LineChart
      v-if="history.length"
      :data="chartData"
      :options="chartOptions"
    />
  </div>
</template>

<script lang="ts">
import { defineComponent, computed } from "vue";
import LineChart from "@/components/charts/LineChart.vue";

interface PricePoint {
  price: number;
  timestamp: number;
}

export default defineComponent({
  name: "PriceHistoryChart",
  components: { LineChart },
  props: {
    history: {
      type: Array as () => PricePoint[],
      required: true,
    },
  },
  setup(props) {
    const chartData = computed(() => {
      const sorted = [...props.history].sort(
        (a, b) => a.timestamp - b.timestamp,
      );

      return {
        labels: sorted.map((p) => {
          const d = new Date(p.timestamp);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        }),
        datasets: [
          {
            label: "Price (€)",
            data: sorted.map((p) => p.price),
            borderColor: "#3880ff", // Ionic primary
            backgroundColor: (ctx: any) => {
              const chart = ctx.chart;
              const { ctx: c, chartArea } = chart;
              if (!chartArea) return "#3880ff33";
              const gradient = c.createLinearGradient(
                0,
                chartArea.top,
                0,
                chartArea.bottom,
              );
              gradient.addColorStop(0, "rgba(56, 128, 255, 0.3)");
              gradient.addColorStop(1, "rgba(56, 128, 255, 0)");
              return gradient;
            },
            tension: 0.3,
            fill: true,
            pointRadius: (ctx: any) => {
              // highlight last point
              return ctx.dataIndex === sorted.length - 1 ? 5 : 3;
            },
            pointBackgroundColor: (ctx: any) =>
              ctx.dataIndex === sorted.length - 1 ? "#3880ff" : "#fff",
            pointBorderColor: "#3880ff",
            pointBorderWidth: 2,
          },
        ],
      };
    });

    const chartOptions = computed(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: any) => `${context.parsed.y.toFixed(2)} €`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: false,
          ticks: { callback: (value: any) => `${value} €` },
        },
      },
    }));

    return { chartData, chartOptions };
  },
});
</script>

<style scoped>
.price-history-chart {
  height: 100%;
  width: 100%;
  margin-top: 12px;
}
</style>
