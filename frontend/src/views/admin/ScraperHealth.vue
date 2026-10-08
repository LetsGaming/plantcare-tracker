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
          <source-status-strip v-if="loaded" :sources="sources" />

          <refresh-error-banner v-if="failed" :busy="loading" @retry="load" />

          <p v-if="loaded && sources.length === 0" class="intro">
            {{ t("admin.scrapers.empty") }}
          </p>

          <section v-for="group in groups" :key="group.kind" class="group">
            <div class="group-header">
              <h2 class="group-title">{{ t(`admin.scrapers.section.${group.kind}`) }}</h2>
              <ion-button
                v-if="group.kind === 'sales'"
                fill="outline"
                class="check-all"
                :disabled="busy"
                @click="checkAll"
              >
                {{ t("admin3.check_all") }}
              </ion-button>
            </div>

            <p v-if="group.kind === 'sales'" class="progress" role="status" aria-live="polite">
              <template v-if="batch">
                {{ t("admin3.check_all_progress", { done: batch.done, total: batch.total }) }}
              </template>
            </p>
            <p v-else class="note">{{ t("admin3.search_note") }}</p>

            <ul class="rows">
              <source-row
                v-for="source in group.sources"
                :key="source.key"
                :source="source"
                :result="results[source.key] ?? null"
                :checkable="source.kind === 'sales'"
                :checking="checking === source.key"
                :disabled="busy"
                @recheck="recheck"
              />
            </ul>
          </section>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonRefresher, IonRefresherContent, IonButton } from "@ionic/vue";
import { reloadOutline } from "ionicons/icons";

import AdminHeader from "@/components/admin/AdminHeader.vue";
import RefreshErrorBanner from "@/components/admin/RefreshErrorBanner.vue";
import SourceRow from "@/components/admin/SourceRow.vue";
import SourceStatusStrip from "@/components/admin/SourceStatusStrip.vue";
import IconButton from "@/components/ui/IconButton.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { mapActions, mapState } from "pinia";
import { useAdminHealthStore } from "@/stores/adminHealth";
import localizationService from "@/services/general/LocalizationService";

const KIND_ORDER: SourceKind[] = ["sales", "search"];

export default defineComponent({
  name: "ScraperHealth",
  components: {
    IonPage,
    IonContent,
    IonRefresher,
    IonRefresherContent,
    IonButton,
    AdminHeader,
    IconButton,
    RefreshErrorBanner,
    SourceRow,
    SourceStatusStrip,
    StateBlock,
  },
  data() {
    return {
      loading: false,
      failed: false,
      reloadIcon: reloadOutline,
    };
  },
  computed: {
    ...mapState(useAdminHealthStore, ["sources", "loaded", "checking", "batch", "results", "busy"]),
    groups(): { kind: SourceKind; sources: SourceHealth[] }[] {
      return KIND_ORDER.map((kind) => ({
        kind,
        sources: this.sources.filter((s) => s.kind === kind),
      })).filter((group) => group.sources.length > 0);
    },
  },
  async mounted() {
    await this.load();
  },
  methods: {
    ...mapActions(useAdminHealthStore, {
      loadHealth: "load",
      recheckSource: "recheck",
      recheckEverySource: "recheckAll",
    }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async load(): Promise<void> {
      this.loading = true;
      this.failed = false;
      try {
        await this.loadHealth();
      } catch (error) {
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
      try {
        await this.recheckSource(source.key);
      } catch (error) {
        console.error("Source re-check failed:", error);
      }
    },
    async checkAll(): Promise<void> {
      await this.recheckEverySource();
    },
  },
});
</script>

<style scoped>
.page {
  max-width: var(--content-max);
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.intro {
  margin: 0;
  color: var(--ink-soft);
}

.group {
  background: var(--surface-raised);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4) 0;
}

.group-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.check-all {
  margin: 0;
  min-height: var(--tap-min);
}

.progress,
.note {
  margin: var(--space-1) var(--space-4) var(--space-2);
  font-size: var(--text-sm);
  color: var(--ink-soft);
}

.progress:empty {
  display: none;
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
</style>
