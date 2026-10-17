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
        <tr v-for="point in sorted" :key="point.observedAt">
          <td>{{ formatDate(point.observedAt) }}</td>
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
import { dateTimeFormat, numberFormat } from "@/utils/intlCache";
import { formatDisplayDate } from "@/utils/localDate";

export default defineComponent({
  name: "PriceHistoryChart",
  components: { LineChart },
  props: {
    history: {
      type: Array as () => readonly SalePricePoint[],
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
    sorted(): SalePricePoint[] {
      return [...this.history].sort((a, b) => a.observedAt - b.observedAt);
    },
    prices(): number[] {
      return this.sorted.map((p) => p.price);
    },
    chartData() {
      const prices = this.prices;
      const lastIndex = prices.length - 1;
      return {
        labels: this.sorted.map((p) =>
          dateTimeFormat(localizationService.getLocale(), {
            day: "numeric",
            month: "numeric",
          }).format(new Date(p.observedAt)),
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
        from: this.formatDate(this.sorted[0].observedAt),
        to: this.formatDate(this.sorted[this.sorted.length - 1].observedAt),
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
      return formatDisplayDate(timestamp, localizationService.getLocale());
    },
    formatPrice(value: number): string {
      return numberFormat(localizationService.getLocale(), {
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
