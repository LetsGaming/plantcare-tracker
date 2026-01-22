<template>
  <div class="price-history-chart">
    <LineChart :data="chartData" :options="chartOptions" />
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
    referencePrice: {
      type: Number,
      required: false,
    },
  },
  setup(props) {
    const sorted = [...props.history].sort((a, b) => a.timestamp - b.timestamp);

    const prices = sorted.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = Math.max((max - min) * 0.2, 0.5);

    const chartData = computed(() => ({
      labels: sorted.map((p) => {
        const d = new Date(p.timestamp);
        return `${d.getDate()}/${d.getMonth() + 1}`;
      }),
      datasets: [
        {
          data: prices,
          borderColor: "#3880ff",
          tension: 0.3,
          fill: true,
          pointRadius: (ctx: any) =>
            ctx.dataIndex === prices.length - 1 ? 5 : 3,
          pointBackgroundColor: "#3880ff",
        },
        ...(props.referencePrice
          ? [
              {
                data: new Array(prices.length).fill(props.referencePrice),
                borderColor: "rgba(0,0,0,0.25)",
                borderDash: [4, 4],
                pointRadius: 0,
              },
            ]
          : []),
      ],
    }));

    const chartOptions = computed(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
    }));

    return { chartData, chartOptions };
  },
});
</script>

<style scoped>
.price-history-chart {
  height: 160px;
  margin-top: 12px;
}
</style>
