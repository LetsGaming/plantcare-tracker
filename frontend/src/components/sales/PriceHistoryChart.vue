<template>
  <div class="price-history-chart">
    <div class="plot">
      <LineChart :data="chartData" :options="chartOptions" :aria-label="summary" />
    </div>
    <table class="sr-only">
      <caption>
        {{
          caption
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ t("chart.table_date") }}</th>
          <th scope="col">{{ t("chart.table_value") }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="point in sorted" :key="point.timestamp">
          <td>{{ formatDate(point.timestamp) }}</td>
          <td>{{ formatPrice(point.price) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import LineChart from "@/components/charts/LineChart.vue";
import localizationService from "@/services/general/LocalizationService";

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
    caption: {
      type: String,
      default: "",
    },
  },
  computed: {
    sorted(): PricePoint[] {
      return [...this.history].sort((a, b) => a.timestamp - b.timestamp);
    },
    prices(): number[] {
      return this.sorted.map((p) => p.price);
    },
    chartData() {
      const prices = this.prices;
      const lastIndex = prices.length - 1;
      return {
        labels: this.sorted.map((p) =>
          new Date(p.timestamp).toLocaleDateString(localizationService.getLocale(), {
            day: "numeric",
            month: "numeric",
          }),
        ),
        datasets: [
          {
            data: prices,
            pointRadius: (ctx: { dataIndex: number }) => (ctx.dataIndex === lastIndex ? 5 : 3),
          },
          ...(this.referencePrice
            ? [
                {
                  data: new Array(prices.length).fill(this.referencePrice),
                  label: this.t("chart.reference_series"),
                  borderDash: [4, 4],
                  pointRadius: 0,
                },
              ]
            : []),
        ],
      };
    },
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      };
    },
    summary(): string {
      if (this.sorted.length === 0) return "";
      const prices = this.prices;
      return this.t("chart.line_summary", {
        count: prices.length,
        from: this.formatDate(this.sorted[0].timestamp),
        to: this.formatDate(this.sorted[this.sorted.length - 1].timestamp),
        min: this.formatPrice(Math.min(...prices)),
        max: this.formatPrice(Math.max(...prices)),
        last: this.formatPrice(prices[prices.length - 1]),
      });
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars);
    },
    formatDate(timestamp: number): string {
      return new Date(timestamp).toLocaleDateString(localizationService.getLocale());
    },
    formatPrice(value: number): string {
      return new Intl.NumberFormat(localizationService.getLocale(), {
        style: "currency",
        currency: "EUR",
      }).format(value);
    },
  },
});
</script>

<style scoped>
.price-history-chart {
  position: relative;
  margin-top: var(--space-3);
}

.plot {
  height: 200px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
