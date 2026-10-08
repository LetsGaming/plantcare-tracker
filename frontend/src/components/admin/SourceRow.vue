<template>
  <li class="row">
    <div class="main">
      <h3 class="seller">
        {{ source.seller }}
        <ion-badge :color="statusIonColor(source.status)">
          {{ t(`admin.scrapers.status.${source.status}`) }}
        </ion-badge>
      </h3>
      <p class="meta">{{ detailLine }}</p>
      <p v-if="source.consecutiveFailures > 1" class="meta">
        {{ t("admin.scrapers.failures_in_a_row", { count: source.consecutiveFailures }) }}
      </p>
      <ul v-if="source.issues.length" class="issues">
        <li v-for="issue in source.issues" :key="issue.code">
          {{
            t(`admin.scrapers.issue.${issue.code}`, {
              affected: issue.affected,
              total: issue.total,
            })
          }}
        </li>
      </ul>
      <p v-if="source.status === 'failing'" class="cause">{{ t(`admin3.cause.${cause}`) }}</p>
      <p class="result" role="status" aria-live="polite">{{ resultText }}</p>
      <details v-if="source.status !== 'ok' && source.lastError" class="tech">
        <summary>
          <span>{{ t("admin3.tech_details") }}</span>
          <ion-icon class="chevron" :icon="icons.chevronDown" aria-hidden="true" />
        </summary>
        <pre class="error-text">{{ source.lastError }}</pre>
      </details>
    </div>

    <ion-button
      v-if="checkable"
      class="check"
      fill="outline"
      :disabled="disabled || checking"
      :aria-label="t('admin3.recheck_label', { seller: source.seller })"
      :aria-busy="checking ? 'true' : undefined"
      @click="$emit('recheck', source)"
    >
      <ion-spinner v-if="checking" name="dots" aria-hidden="true" />
      <template v-else>{{ t("admin.scrapers.recheck") }}</template>
    </ion-button>
  </li>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { IonBadge, IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { DateTime } from "luxon";

import localizationService from "@/services/general/LocalizationService";
import type { RecheckResult } from "@/stores/adminHealth";
import { icons } from "@/theme/icons";
import { relativePhrase } from "@/utils/relativeTime";
import { failureCause, statusIonColor } from "@/utils/sourceStatus";

/** One scrape source: status, how it last worked, the likely cause when failing and its re-check action. */
export default defineComponent({
  name: "SourceRow",
  components: { IonBadge, IonButton, IonIcon, IonSpinner },
  props: {
    source: { type: Object as PropType<SourceHealth>, required: true },
    result: { type: Object as PropType<RecheckResult | null>, default: null },
    checkable: { type: Boolean, default: false },
    checking: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  emits: ["recheck"],
  setup() {
    return { statusIonColor, icons };
  },
  computed: {
    cause(): string {
      return failureCause(this.source.lastError);
    },
    detailLine(): string {
      const parts: string[] = [];
      if (this.source.strategy) {
        parts.push(
          this.t("admin.scrapers.strategy", {
            strategy: this.t(`admin.scrapers.strategy.${this.source.strategy}`),
          }),
        );
      }
      if (this.source.itemCount !== null && this.source.kind === "sales") {
        parts.push(this.t("admin.scrapers.items", { count: this.source.itemCount }));
      }
      if (this.source.status !== "unknown") parts.push(this.lastSuccessText());
      return parts.join(" · ");
    },
    resultText(): string {
      if (!this.result) return "";
      const time = DateTime.fromMillis(this.result.checkedAt)
        .setLocale(localizationService.getLocale())
        .toLocaleString(DateTime.TIME_SIMPLE);
      return this.t(`admin3.result.${this.result.outcome}`, { time });
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    lastSuccessText(): string {
      if (!this.source.lastSuccessAt) return this.t("admin.scrapers.never_succeeded");
      const time =
        relativePhrase(this.source.lastSuccessAt, localizationService.getLocale()) ??
        this.t("final2.just_now");
      return this.t("admin.scrapers.last_success", { time });
    },
  },
});
</script>

<style scoped>
.issues {
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--ink-soft);
  font-size: var(--text-sm);
}

.row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--line);
}

.row:first-child {
  border-top: 0;
}

.main {
  min-width: 0;
  flex: 1;
}

.seller {
  margin: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 650;
}

.meta,
.cause,
.result {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.cause {
  color: var(--ion-text-color);
  font-weight: 600;
}

.result:empty {
  display: none;
}

.result {
  color: var(--ion-text-color);
  font-weight: 600;
}

.tech {
  margin-top: var(--space-2);
  font-size: var(--text-sm);
}

.tech summary {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--tap-min);
  cursor: pointer;
  color: var(--ion-text-color);
  font-weight: 600;
  list-style: none;
}

.tech summary::-webkit-details-marker {
  display: none;
}

.tech summary:focus-visible {
  outline: 2px solid var(--ion-color-primary);
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

.chevron {
  font-size: 1.25em;
  transition: transform 0.2s ease;
}

.tech[open] .chevron {
  transform: rotate(180deg);
}

.error-text {
  margin: 0 0 var(--space-2);
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: var(--surface-sunken);
  font-family: monospace;
  font-size: var(--text-xs);
  white-space: pre-wrap;
  word-break: break-word;
}

.check {
  flex-shrink: 0;
  min-height: var(--tap-min);
  margin: 0;
}
</style>
