<template>
  <ion-page>
    <admin-header :title="t('admin.title')" back-href="/tabs/plants" />

    <ion-content>
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh($event)">
        <ion-refresher-content />
      </ion-refresher>

      <div class="page">
        <p class="intro">{{ t("admin.dashboard.intro") }}</p>

        <state-block
          v-if="loading && !loaded"
          kind="loading"
          :title="t('state.loading')"
          :skeletons="2"
        />

        <state-block
          v-else-if="failed && !loaded"
          kind="error"
          :title="t('state.error_title')"
          :message="t('state.error_message')"
          :action-label="t('state.retry')"
          @action="load"
        />

        <template v-else-if="loaded">
          <source-status-strip :sources="sources" />

          <refresh-error-banner v-if="failed" :busy="loading" @retry="load" />

          <section class="group" aria-labelledby="attention-title">
            <h2 id="attention-title" class="group-title">{{ t("admin3.dashboard.attention") }}</h2>
            <ul v-if="attention.length" class="rows">
              <source-row
                v-for="source in attention"
                :key="source.key"
                :source="source"
                :result="results[source.key] ?? null"
                :checkable="source.kind === 'sales'"
                :checking="checking === source.key"
                :disabled="busy"
                @recheck="recheck"
              />
            </ul>
            <p v-else class="note">{{ t("admin3.dashboard.nothing") }}</p>
          </section>

          <ion-button
            class="view-all"
            fill="outline"
            router-link="/tabs/admin/scrapers"
            router-direction="forward"
          >
            {{ t("admin3.dashboard.view_all") }}
            <ion-icon slot="end" :icon="chevronForwardOutline" aria-hidden="true" />
          </ion-button>
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
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
} from "@ionic/vue";
import { chevronForwardOutline } from "ionicons/icons";

import AdminHeader from "@/components/admin/AdminHeader.vue";
import RefreshErrorBanner from "@/components/admin/RefreshErrorBanner.vue";
import SourceRow from "@/components/admin/SourceRow.vue";
import SourceStatusStrip from "@/components/admin/SourceStatusStrip.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { mapActions, mapState } from "pinia";
import { useAdminHealthStore } from "@/stores/adminHealth";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "AdminDashboard",
  components: {
    IonPage,
    IonContent,
    IonButton,
    IonIcon,
    IonRefresher,
    IonRefresherContent,
    AdminHeader,
    RefreshErrorBanner,
    SourceRow,
    SourceStatusStrip,
    StateBlock,
  },
  setup() {
    return { chevronForwardOutline };
  },
  data() {
    return { loading: false, failed: false };
  },
  computed: {
    ...mapState(useAdminHealthStore, ["sources", "loaded", "checking", "results", "busy"]),
    attention(): SourceHealth[] {
      return this.sources.filter((source) => source.status !== "ok");
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
    async load() {
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

.group-title {
  margin: 0;
  padding: var(--space-3) var(--space-4) 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.note {
  margin: 0;
  padding: var(--space-3) var(--space-4) var(--space-4);
  color: var(--ink-soft);
}

.view-all {
  align-self: flex-start;
  margin: 0;
  min-height: var(--tap-min);
}
</style>
