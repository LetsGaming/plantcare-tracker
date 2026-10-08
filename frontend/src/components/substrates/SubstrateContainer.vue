<template>
  <section v-if="substrate" class="composition" aria-labelledby="composition-heading">
    <h2 id="composition-heading" class="section-title">{{ t("subdetail.composition") }}</h2>

    <div v-if="components.length === 0" class="empty">
      <h3 class="empty-title">{{ t("subdetail.no_components_title") }}</h3>
      <p class="empty-message">{{ t("subdetail.no_components_message") }}</p>
    </div>

    <div v-else class="composition-grid">
      <PieChart :data="chartData" :show-legend="false" class="chart" />

      <div class="list-column">
        <SearchBar
          v-if="components.length > SEARCH_THRESHOLD"
          :placeholder="t('component.search.placeholder')"
          :aria-label="t('subdetail.search_label')"
          @search="filterComponents"
        />
        <ul class="component-list">
          <li v-for="item in visibleComponents" :key="item.id" class="component-row">
            <span class="swatch" :class="`swatch-${item.colorIndex}`" aria-hidden="true" />
            <router-link
              class="component-link"
              :to="{
                name: 'component-details',
                params: { id: item.id, public: substrate.isPublic ? '1' : '0' },
              }"
            >
              <span class="component-name">{{ item.name }}</span>
              <span class="component-fineness">{{ finenessLabel(item.fineness) }}</span>
            </router-link>
            <span class="component-amount">
              <span class="amount-parts">{{ partsLabel(item.parts) }}</span>
              <span class="amount-share">{{ item.percent }}</span>
            </span>
          </li>
        </ul>
        <p v-if="visibleComponents.length === 0" class="no-matches">
          {{ t("subdetail.no_matches") }}
        </p>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import PieChart from "@/components/charts/PieChart.vue";
import SearchBar from "@/components/SearchBar.vue";
import localizationService from "@/services/general/LocalizationService";
import Utils from "@/utils/utils";
import { finenessLabel, partsLabel } from "@/utils/enumLabels";

const SEARCH_THRESHOLD = 5;
const PALETTE_SIZE = 6;

interface CompositionRow extends SubstrateComponent {
  colorIndex: number;
  percent: string;
}

export default defineComponent({
  name: "SubstrateContainer",
  components: { PieChart, SearchBar },
  props: {
    substrate: {
      type: Object as () => Substrate,
    },
  },
  data() {
    return {
      query: "",
      SEARCH_THRESHOLD,
    };
  },
  computed: {
    components(): CompositionRow[] {
      const locale = localizationService.getLocale();
      const list = [...(this.substrate?.components ?? [])].sort((a, b) =>
        a.parts !== b.parts ? b.parts - a.parts : a.name.localeCompare(b.name, locale),
      );
      const total = list.reduce((sum, c) => sum + c.parts, 0);
      const formatter = new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: 0,
      });
      return list.map((component, index) => ({
        ...component,
        colorIndex: (index % PALETTE_SIZE) + 1,
        percent: this.t("subdetail.share_value", {
          percent: formatter.format(total > 0 ? component.parts / total : 0),
        }),
      }));
    },
    visibleComponents(): CompositionRow[] {
      return Utils.baseSearchFilter(this.query, this.components);
    },
    chartData(): { name: string; parts: number }[] {
      return this.components.map((component) => ({
        name: `${component.name} (${finenessLabel(component.fineness)})`,
        parts: component.parts,
      }));
    },
  },
  methods: {
    finenessLabel,
    partsLabel,
    filterComponents(query: string) {
      this.query = query;
    },
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
  },
});
</script>

<style scoped>
.composition {
  display: grid;
  gap: var(--space-4);
  container-type: inline-size;
}

.section-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.composition-grid {
  display: grid;
  gap: var(--space-5);
  align-items: start;
}

.list-column {
  display: grid;
  gap: var(--space-3);
  min-width: 0;
}

.component-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.component-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-3);
  min-height: var(--tap-min);
  padding: var(--space-2) var(--space-3);
  background: var(--surface-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
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

.component-link {
  display: grid;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.component-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.component-fineness,
.amount-share {
  font-size: var(--text-xs);
  color: var(--ink-soft);
}

.component-amount {
  display: grid;
  justify-items: end;
  font-variant-numeric: tabular-nums;
}

.amount-parts {
  font-weight: 600;
}

.empty {
  padding: var(--space-4);
  background: var(--surface-sunken);
  border-radius: var(--radius-md);
}

.empty-title {
  margin: 0 0 var(--space-1);
  font-size: var(--text-md);
}

.empty-message,
.no-matches {
  margin: 0;
  color: var(--ink-soft);
}

@container (min-width: 600px) {
  .composition-grid {
    grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
  }
}
</style>
