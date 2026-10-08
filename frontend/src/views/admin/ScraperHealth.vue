<template>
  <ion-page>
    <admin-header :title="t('admin.scrapers.title')" back-href="/tabs/admin">
      <template #actions>
        <icon-button
          :icon="reloadIcon"
          :label="t('admin2.reload')"
          :disabled="loading"
          @press="load"
        />
      </template>
    </admin-header>

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div class="page">
        <p class="intro">{{ t("admin.scrapers.description") }}</p>

        <state-block
          v-if="loading && !loaded"
          kind="loading"
          :title="t('state.loading')"
          :skeletons="3"
        />

        <state-block
          v-else-if="failed && !loaded"
          kind="error"
          :title="t('state.error_title')"
          :message="t('state.error_message')"
          :action-label="t('state.retry')"
          @action="load"
        />

        <template v-else>
          <ion-card v-if="loaded" class="summary" :class="`summary--${overall}`">
            <ion-card-content>
              <ion-icon :icon="overallIcon" aria-hidden="true" />
              <span>{{ summaryText }}</span>
            </ion-card-content>
          </ion-card>

          <p v-if="loaded && sources.length === 0" class="intro">
            {{ t("admin.scrapers.empty") }}
          </p>

          <ion-card v-for="group in groups" :key="group.kind">
            <ion-list lines="full">
              <ion-list-header>
                <ion-label>{{ t(`admin.scrapers.section.${group.kind}`) }}</ion-label>
              </ion-list-header>

              <ion-item v-for="source in group.sources" :key="source.key">
                <ion-label class="ion-text-wrap">
                  <h2 class="source-title">
                    {{ source.seller }}
                    <ion-badge :color="statusColor(source.status)">
                      {{ t(`admin.scrapers.status.${source.status}`) }}
                    </ion-badge>
                  </h2>
                  <p>{{ detailLine(source) }}</p>
                  <p v-if="source.consecutiveFailures > 1">
                    {{
                      t("admin.scrapers.failures_in_a_row", {
                        count: source.consecutiveFailures,
                      })
                    }}
                  </p>
                  <p v-if="source.status !== 'ok' && source.lastError" class="source-error">
                    {{ source.lastError }}
                  </p>
                </ion-label>

                <ion-button
                  v-if="source.kind === 'sales'"
                  slot="end"
                  fill="outline"
                  size="small"
                  :disabled="checking === source.key"
                  @click="recheck(source)"
                >
                  <ion-spinner v-if="checking === source.key" name="dots" />
                  <template v-else>{{ t("admin.scrapers.recheck") }}</template>
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonButton,
  IonCard,
  IonCardContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonBadge,
  IonIcon,
  IonSpinner,
} from "@ionic/vue";
import { checkmarkCircle, warning, alertCircle, reload } from "ionicons/icons";
import { DateTime } from "luxon";

import AdminHeader from "@/components/admin/AdminHeader.vue";
import IconButton from "@/components/ui/IconButton.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { mapActions, mapState } from "pinia";
import { useAdminHealthStore } from "@/stores/adminHealth";
import ToastService from "@/services/general/ToastService";
import localizationService from "@/services/general/LocalizationService";

const KIND_ORDER: SourceKind[] = ["sales", "search"];

const STATUS_COLORS: Record<SourceStatus, string> = {
  ok: "success",
  degraded: "warning",
  failing: "danger",
  unknown: "light",
};

export default defineComponent({
  name: "ScraperHealth",
  components: {
    IonPage,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    IonCard,
    IonCardContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonBadge,
    IonIcon,
    IonSpinner,
    AdminHeader,
    IconButton,
    StateBlock,
  },
  data() {
    return {
      checking: null as string | null,
      loading: false,
      failed: false,
      reloadIcon: reload,
    };
  },
  computed: {
    ...mapState(useAdminHealthStore, ["sources", "loaded"]),
    groups(): { kind: SourceKind; sources: SourceHealth[] }[] {
      return KIND_ORDER.map((kind) => ({
        kind,
        sources: this.sources.filter((s) => s.kind === kind),
      })).filter((group) => group.sources.length > 0);
    },
    counts(): Record<SourceStatus, number> {
      const counts = { ok: 0, degraded: 0, failing: 0, unknown: 0 };
      this.sources.forEach((s) => counts[s.status]++);
      return counts;
    },
    overall(): "failing" | "degraded" | "ok" {
      if (this.counts.failing > 0) return "failing";
      if (this.counts.degraded > 0) return "degraded";
      return "ok";
    },
    overallIcon(): string {
      return {
        failing: alertCircle,
        degraded: warning,
        ok: checkmarkCircle,
      }[this.overall];
    },
    summaryText(): string {
      if (this.overall === "ok" && this.counts.unknown === 0) {
        return this.t("admin.scrapers.all_ok");
      }
      return this.t("admin.scrapers.summary", {
        failing: this.counts.failing,
        degraded: this.counts.degraded,
        ok: this.counts.ok,
      });
    },
  },
  async mounted() {
    await this.load();
  },
  methods: {
    ...mapActions(useAdminHealthStore, { loadHealth: "load", recheckSource: "recheck" }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    statusColor(status: SourceStatus): string {
      return STATUS_COLORS[status];
    },
    async load(): Promise<void> {
      this.loading = true;
      this.failed = false;
      try {
        await this.loadHealth();
      } catch (error) {
        // handleRequest has already shown the error toast.
        this.failed = true;
        console.error("Loading source health failed:", error);
      } finally {
        this.loading = false;
      }
    },
    async handleRefresh(event: CustomEvent): Promise<void> {
      await this.load();
      (event.target as HTMLIonRefresherElement).complete();
    },
    async recheck(source: SourceHealth): Promise<void> {
      this.checking = source.key;
      try {
        await this.recheckSource(source.key);
        ToastService.showSuccess({
          key: "admin.scrapers.rechecked",
          vars: { seller: source.seller },
          fallback: `${source.seller} checked.`,
        });
      } catch (error) {
        console.error("Source re-check failed:", error);
      } finally {
        this.checking = null;
      }
    },
    detailLine(source: SourceHealth): string {
      const parts: string[] = [];
      if (source.strategy) {
        parts.push(
          this.t("admin.scrapers.strategy", {
            strategy: this.t(`admin.scrapers.strategy.${source.strategy}`),
          }),
        );
      }
      if (source.itemCount !== null && source.kind === "sales") {
        parts.push(this.t("admin.scrapers.items", { count: source.itemCount }));
      }
      if (source.status !== "unknown") {
        parts.push(this.lastSuccessText(source));
      }
      return parts.join(" · ");
    },
    lastSuccessText(source: SourceHealth): string {
      if (!source.lastSuccessAt) return this.t("admin.scrapers.never_succeeded");
      const time = DateTime.fromISO(source.lastSuccessAt)
        .setLocale(localizationService.getLocale())
        .toRelative();
      return this.t("admin.scrapers.last_success", { time: time ?? "" });
    },
  },
});
</script>

<style scoped>
.page {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-3) var(--space-2);
  box-sizing: border-box;
}

.intro {
  margin: 0 var(--space-3) var(--space-3);
  color: var(--ink-soft);
}

.summary ion-card-content {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-weight: 600;
}

.summary--ok ion-icon {
  color: var(--ion-color-success);
}

.summary--degraded ion-icon {
  color: var(--ion-color-warning);
}

.summary--failing ion-icon {
  color: var(--ion-color-danger);
}

.source-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-weight: 600;
}

.source-error {
  color: var(--ion-color-danger);
  word-break: break-word;
}
</style>
