<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/profile" />
        </ion-buttons>
        <ion-title>{{ t("admin.title") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <p class="intro">{{ t("admin.dashboard.intro") }}</p>

      <ion-card>
        <ion-list lines="none">
          <ion-item v-for="tool in tools" :key="tool.route" button detail :router-link="tool.route">
            <ion-icon slot="start" :icon="tool.icon" />
            <ion-label class="ion-text-wrap">
              <h2>{{ t(tool.titleKey) }}</h2>
              <p>{{ t(tool.descriptionKey) }}</p>
            </ion-label>
            <ion-badge v-if="tool.badge && tool.badge() > 0" slot="end" color="danger">
              {{ tool.badge() }}
            </ion-badge>
          </ion-item>
        </ion-list>
      </ion-card>
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonCard,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
} from "@ionic/vue";
import { pulseOutline } from "ionicons/icons";

import AdminService from "@/services/AdminService";
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
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCard,
    IonList,
    IonItem,
    IonLabel,
    IonIcon,
    IonBadge,
  },
  data() {
    return {
      failingSources: 0,
    };
  },
  computed: {
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
    try {
      this.failingSources = AdminService.countNeedingAttention(
        await AdminService.getSourceHealth(),
      );
    } catch (error) {
      // handleRequest has already shown the error toast.
      console.error("Loading source health failed:", error);
    }
  },
  methods: {
    t(key: string) {
      return localizationService.t(key, undefined, key);
    },
  },
});
</script>

<style scoped>
.intro {
  margin: 16px;
  color: var(--ion-color-medium);
}
</style>
