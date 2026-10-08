<template>
  <ion-page>
    <admin-header :title="t('admin.title')" back-href="/tabs/plants" />

    <ion-content>
      <div class="page">
        <p class="intro">{{ t("admin.dashboard.intro") }}</p>

        <ion-list lines="none" class="tools">
          <ion-item v-for="tool in tools" :key="tool.route" button detail :router-link="tool.route">
            <ion-icon slot="start" :icon="tool.icon" aria-hidden="true" />
            <ion-label class="ion-text-wrap">
              <h2>{{ t(tool.titleKey) }}</h2>
              <p>{{ t(tool.descriptionKey) }}</p>
            </ion-label>
            <ion-badge v-if="tool.badge && tool.badge() > 0" slot="end" color="danger">
              {{ t("shell.scrapers_failing", { count: tool.badge() }) }}
            </ion-badge>
          </ion-item>
        </ion-list>

        <state-block
          v-if="failed"
          kind="error"
          :title="t('state.error_title')"
          :message="t('state.error_message')"
          :action-label="t('state.retry')"
          @action="load"
        />
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonPage, IonContent, IonList, IonItem, IonLabel, IonIcon, IonBadge } from "@ionic/vue";
import { pulseOutline } from "ionicons/icons";

import AdminHeader from "@/components/admin/AdminHeader.vue";
import StateBlock from "@/components/ui/StateBlock.vue";
import { mapActions, mapState } from "pinia";
import { useAdminHealthStore } from "@/stores/adminHealth";
import localizationService from "@/services/general/LocalizationService";

interface AdminTool {
  route: string;
  icon: string;
  titleKey: string;
  descriptionKey: string;
  /** Number shown as an attention badge, hidden when 0 */
  badge?: () => number;
}

export default defineComponent({
  name: "AdminDashboard",
  components: {
    IonPage,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonBadge,
    AdminHeader,
    StateBlock,
  },
  data() {
    return { failed: false };
  },
  computed: {
    ...mapState(useAdminHealthStore, { failingSources: "needingAttention" }),
    tools(): AdminTool[] {
      return [
        {
          route: "/tabs/admin/scrapers",
          icon: pulseOutline,
          titleKey: "admin.scrapers.title",
          descriptionKey: "admin.scrapers.description",
          badge: () => this.failingSources,
        },
      ];
    },
  },
  async mounted() {
    await this.load();
  },
  methods: {
    ...mapActions(useAdminHealthStore, { loadHealth: "load" }),
    t(key: string, vars?: Record<string, string | number>) {
      return localizationService.t(key, vars, key);
    },
    async load() {
      this.failed = false;
      try {
        await this.loadHealth();
      } catch (error) {
        // handleRequest has already shown the error toast.
        this.failed = true;
        console.error("Loading source health failed:", error);
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
}

.intro {
  margin: 0 0 var(--space-4);
  color: var(--ink-soft);
}

.tools {
  background: var(--surface-raised);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
</style>
