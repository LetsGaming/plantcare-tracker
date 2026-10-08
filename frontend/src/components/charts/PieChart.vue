<template>
  <figure class="pie-chart">
    <div class="canvas-box" role="img" :aria-label="summary">
      <PieCanvas :data="chartData" :options="chartOptions" aria-hidden="true" />
    </div>
    <ul v-if="showLegend" class="legend">
      <li v-for="(slice, index) in slices" :key="index" class="legend-item">
        <span class="swatch" :class="`swatch-${(index % 6) + 1}`" />
        <span class="legend-name">{{ slice.name }}</span>
        <span class="legend-value">{{ slice.parts }} · {{ slice.percent }}</span>
      </li>
    </ul>
  </figure>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { Pie } from "vue-chartjs";
import { Chart as ChartJS, Title, Tooltip, ArcElement, TooltipItem } from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import localizationService from "@/services/general/LocalizationService";

interface PieSlice {
  name: string;
  parts: number;
}

ChartJS.register(Title, Tooltip, ArcElement);

const PALETTE_SIZE = 6;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default defineComponent({
  name: "PieChart",
  components: {
    PieCanvas: Pie,
  },
  props: {
    data: {
      type: Array as PropType<PieSlice[]>,
      required: true,
    },
    showLegend: {
      type: Boolean,
      default: true,
    },
  },
  data() {
    return {
      chartData: { labels: [], datasets: [] } as ChartData<"pie">,
      chartOptions: {} as ChartOptions<"pie">,
      observer: null as MutationObserver | null,
    };
  },
  computed: {
    total(): number {
      return this.data.reduce((sum, slice) => sum + slice.parts, 0);
    },
    slices(): { name: string; parts: number; percent: string }[] {
      const formatter = new Intl.NumberFormat(localizationService.getLocale(), {
        style: "percent",
        maximumFractionDigits: 0,
      });
      return this.data.map((slice) => ({
        name: slice.name,
        parts: slice.parts,
        percent: formatter.format(this.total > 0 ? slice.parts / this.total : 0),
      }));
    },
    summary(): string {
      const items = this.slices
        .map((slice) =>
          localizationService.t("chart.pie_item", {
            name: slice.name,
            parts: slice.parts,
            percent: slice.percent,
          }),
        )
        .join("; ");
      return localizationService.t("chart.pie_summary", { items });
    },
  },
  watch: {
    data: {
      handler() {
        this.applyTheme();
      },
      deep: true,
    },
  },
  mounted() {
    this.applyTheme();
    this.observer = new MutationObserver(() => this.applyTheme());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
  },
  beforeUnmount() {
    this.observer?.disconnect();
    this.observer = null;
  },
  methods: {
    applyTheme() {
      const colors = Array.from({ length: PALETTE_SIZE }, (_, i) => cssVar(`--chart-${i + 1}`));
      const background = this.data.map((_, i) => colors[i % PALETTE_SIZE]);
      const textColor = cssVar("--chart-text-color");
      this.chartData = {
        labels: this.data.map((slice) => slice.name),
        datasets: [
          {
            label: localizationService.t("chart.parts"),
            data: this.data.map((slice) => slice.parts),
            backgroundColor: background,
            borderColor: cssVar("--surface-raised"),
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      };
      this.chartOptions = {
        responsive: true,
        maintainAspectRatio: true,
        layout: { padding: 6 },
        plugins: {
          legend: { display: false },
          tooltip: {
            titleColor: textColor,
            bodyColor: textColor,
            callbacks: {
              label: (item: TooltipItem<"pie">) => `${item.label}: ${item.raw ?? 0}`,
            },
          },
        },
      };
    },
  },
});
</script>

<style scoped>
.pie-chart {
  margin: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.canvas-box {
  width: min(100%, 280px);
  aspect-ratio: 1;
}

.legend {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: grid;
  gap: var(--space-2);
}

.legend-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
}

.swatch {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

.swatch-1 {
  background: var(--chart-1);
}
.swatch-2 {
  background: var(--chart-2);
}
.swatch-3 {
  background: var(--chart-3);
}
.swatch-4 {
  background: var(--chart-4);
}
.swatch-5 {
  background: var(--chart-5);
}
.swatch-6 {
  background: var(--chart-6);
}

.legend-name {
  overflow-wrap: anywhere;
}

.legend-value {
  color: var(--ink-soft);
  font-variant-numeric: tabular-nums;
}
</style>
