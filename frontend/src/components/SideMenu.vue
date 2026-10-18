<template>
  <ion-menu
    side="start"
    content-id="main"
    menu-id="main-menu"
    :class="{ rail }"
    :aria-label="t('shell.menu_label')"
  >
    <ion-header>
      <ion-toolbar>
        <ion-title v-if="!rail">{{ t("menu.title") }}</ion-title>
        <ion-buttons slot="end">
          <ion-menu-toggle auto-hide>
            <icon-button :icon="closeIcon" :label="t('shell.close_menu')" />
          </ion-menu-toggle>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list
        lines="none"
        class="section nav-section"
        :aria-label="t('chrome.section_navigation')"
      >
        <h2 v-if="!rail" class="section-title">{{ t("chrome.section_navigation") }}</h2>
        <ion-item
          v-for="dest in destinations"
          :key="dest.tab"
          button
          :class="{ active: isTabActive(dest.tab) }"
          :aria-current="isTabActive(dest.tab) ? 'page' : undefined"
          :aria-label="rail ? t(dest.label) : undefined"
          :title="rail ? t(dest.label) : undefined"
          @click="navigate(`/tabs/${dest.tab}`)"
        >
          <ion-icon slot="start" :icon="tabIcon(dest.tab)" aria-hidden="true" />
          <ion-label>{{ t(dest.label) }}</ion-label>
          <ion-badge
            v-if="dest.tab === 'sales' && salesCount > 0"
            slot="end"
            class="sales-badge"
            :aria-label="t('tabs.sales_new', { count: salesCount })"
          >
            {{ salesCount }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <ion-list lines="none" class="section">
        <h2 v-if="!rail" class="section-title">{{ t("shell.section_account") }}</h2>
        <ion-item
          button
          :class="{ active: isActive('profile') }"
          :aria-current="isActive('profile') ? 'page' : undefined"
          :aria-label="rail ? t('shell.profile') : undefined"
          :title="rail ? t('shell.profile') : undefined"
          @click="navigate({ name: 'profile' })"
        >
          <ion-icon slot="start" :icon="personIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.profile") }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="isAdmin" lines="none" class="section">
        <h2 v-if="!rail" class="section-title">{{ t("shell.section_admin") }}</h2>
        <ion-item
          button
          :class="{ active: isActive('admin-dashboard') }"
          :aria-current="isActive('admin-dashboard') ? 'page' : undefined"
          :aria-label="rail ? t('shell.admin_dashboard') : undefined"
          :title="rail ? t('shell.admin_dashboard') : undefined"
          @click="navigate({ name: 'admin-dashboard' })"
        >
          <ion-icon slot="start" :icon="settingsIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.admin_dashboard") }}</ion-label>
        </ion-item>
        <ion-item
          button
          :class="{ active: isActive('admin-scrapers') }"
          :aria-current="isActive('admin-scrapers') ? 'page' : undefined"
          :aria-label="rail ? t('shell.admin_scrapers') : undefined"
          :title="rail ? t('shell.admin_scrapers') : undefined"
          @click="navigate({ name: 'admin-scrapers' })"
        >
          <ion-icon slot="start" :icon="pulseIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.admin_scrapers") }}</ion-label>
          <ion-badge v-if="sourcesToCheck > 0" slot="end" :color="attentionColor">
            {{ t("shell.scrapers_attention", { count: sourcesToCheck }) }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <ion-list lines="none" class="section">
        <ion-item
          button
          :aria-label="rail ? t('shell.reminders') : undefined"
          :title="rail ? t('shell.reminders') : undefined"
          @click="openReminders"
        >
          <ion-icon slot="start" :icon="calendarIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.reminders") }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="!rail" lines="none" class="section">
        <h2 class="section-title">{{ t("shell.section_preferences") }}</h2>
        <ion-item>
          <ion-select
            :label="t('shell.language')"
            label-placement="start"
            :cancel-text="t('common.cancel')"
            :ok-text="t('copy2.select.ok')"
            :value="selectedLocale"
            @ionChange="changeLocale"
          >
            <ion-select-option v-for="loc in availableLocales" :key="loc" :value="loc">
              {{ localeLabel(loc) }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item>
          <ion-toggle label-placement="start" :checked="darkMode" @ionChange="toggleDarkModeEvent">
            {{ t("menu.dark_mode") }}
          </ion-toggle>
        </ion-item>
        <ion-item>
          <ion-toggle
            class="ion-text-wrap"
            label-placement="start"
            :checked="keepPhoto"
            @ionChange="onKeepPhotoChange"
          >
            {{ t("menu.snap_keep_photo") }}
          </ion-toggle>
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-item
          v-if="pinned"
          button
          lines="none"
          class="rail-toggle"
          :aria-label="rail ? t('menu.expand') : t('menu.collapse')"
          :title="rail ? t('menu.expand') : t('menu.collapse')"
          @click="toggleMenu"
        >
          <ion-icon slot="start" :icon="rail ? expandIcon : collapseIcon" aria-hidden="true" />
          <ion-label>{{ t("menu.collapse") }}</ion-label>
        </ion-item>
        <ion-item
          button
          lines="none"
          :aria-label="rail ? t('shell.logout') : undefined"
          :title="rail ? t('shell.logout') : undefined"
          @click="logout"
        >
          <ion-icon slot="start" :icon="logOutIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.logout") }}</ion-label>
        </ion-item>
      </ion-toolbar>
    </ion-footer>
  </ion-menu>

  <ion-modal
    v-if="remindersMounted"
    :is-open="showReminders"
    :aria-label="t('shell.reminders')"
    @didDismiss="onRemindersDismiss"
  >
    <modal-header :header-title="t('shell.reminders')" @close="showReminders = false" />
    <ion-content>
      <div class="reminders-body">
        <menu-calendar :show-settings-button="true" @settings-click="openDateSettings" />
      </div>
    </ion-content>
  </ion-modal>

  <calendar-settings-modal :is-open="showDateSettings" @close="showDateSettings = false" />
</template>

<script lang="ts">
import { defineComponent, ref } from "vue";
import {
  IonMenu,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonButtons,
  IonMenuToggle,
  IonBadge,
  IonIcon,
  IonLabel,
  IonToggle,
  IonFooter,
  IonModal,
  menuController,
} from "@ionic/vue";
import { icons, navIcons, type NavDestination } from "@/theme/icons";

import MenuCalendar from "./calendar/MenuCalendar.vue";
import CalendarSettingsModal from "./calendar/CalendarSettingsModal.vue";
import IconButton from "@/components/ui/IconButton.vue";
import ModalHeader from "@/components/modal/ModalHeader.vue";
import { useMountWhileOpen } from "@/components/modal/useMountWhileOpen";

import { isDarkMode, setDarkMode } from "@/theme/darkMode";
import localizationService from "@/services/general/LocalizationService";
import { mapActions, mapState } from "pinia";
import { useCalendarStore } from "@/stores/calendar";
import { useSessionStore } from "@/stores/session";
import { useLayoutStore } from "@/stores/layout";
import { useSnapSettingsStore } from "@/stores/snapSettings";
import { useSalesStore } from "@/stores/sales";
import { useAdminHealthStore } from "@/stores/adminHealth";
import { confirmLogout } from "@/utils/confirmLogout";
import { statusIonColor } from "@/utils/sourceStatus";
import type { RouteLocationRaw } from "vue-router";

interface IonicNavManager {
  handleNavigate(to: RouteLocationRaw, action: "push" | "replace", direction: "none"): void;
}

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  de: "Deutsch",
};

export default defineComponent({
  name: "SideMenu",
  props: {
    /** The menu sits beside the content (large screens) and can be collapsed. */
    pinned: { type: Boolean, default: false },
    /** Pinned and collapsed to icons only. */
    rail: { type: Boolean, default: false },
  },
  components: {
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonButtons,
    IonMenuToggle,
    IonBadge,
    IonIcon,
    IconButton,
    IonLabel,
    IonToggle,
    IonFooter,
    IonModal,
    ModalHeader,
    MenuCalendar,
    CalendarSettingsModal,
  },

  inject: {
    navManager: { from: "navManager", default: null },
  },

  setup() {
    const showReminders = ref(false);
    const { mounted, release } = useMountWhileOpen(() => showReminders.value);
    return { showReminders, remindersMounted: mounted, releaseReminders: release };
  },

  data() {
    return {
      // UI
      darkMode: false,
      closeIcon: icons.close,
      collapseIcon: icons.chevronBack,
      expandIcon: icons.chevronForward,
      personIcon: icons.profile,
      logOutIcon: icons.logout,
      calendarIcon: icons.calendar,
      settingsIcon: icons.settings,
      pulseIcon: icons.pulse,
      showDateSettings: false,

      // Localization
      selectedLocale: localizationService.getLocale(),
    };
  },

  async mounted() {
    this.darkMode = isDarkMode();

    /* ---------- Calendar settings ---------- */
    await this.ensureCalendarLoaded();
    this.deleteOldDates();
  },

  computed: {
    ...mapState(useSessionStore, ["isAdmin"]),
    ...mapState(useSnapSettingsStore, ["keepPhoto"]),
    ...mapState(useSalesStore, { salesCount: "newCount" }),
    destinations(): Array<{ tab: NavDestination; label: string }> {
      const list: Array<{ tab: NavDestination; label: string }> = [
        { tab: "plants", label: "tabs.plants" },
        { tab: "substrates", label: "tabs.substrates" },
        { tab: "components", label: "tabs.components" },
        { tab: "sales", label: "tabs.sales" },
      ];
      if (import.meta.env.MODE === "development") list.push({ tab: "debug", label: "tabs.debug" });
      return list;
    },
    ...mapState(useAdminHealthStore, {
      sourcesToCheck: "needingAttention",
      anyFailing: "hasFailing",
    }),
    attentionColor(): string {
      return statusIonColor(this.anyFailing ? "failing" : "degraded");
    },
    availableLocales() {
      return localizationService.availableLocales();
    },
    localizationLabel() {
      return localizationService.t("label.language", undefined, "Language");
    },
  },

  methods: {
    ...mapActions(useSessionStore, { logUserOut: "logout" }),
    ...mapActions(useLayoutStore, ["toggleMenu"]),
    ...mapActions(useSnapSettingsStore, ["setKeepPhoto"]),
    ...mapActions(useCalendarStore, {
      ensureCalendarLoaded: "ensureLoaded",
      deleteOldDates: "deleteOldDates",
    }),

    /* ---------- Localization ---------- */
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    localeLabel(loc: string) {
      return LOCALE_LABELS[loc] || loc;
    },
    async changeLocale(e: CustomEvent) {
      const locale = e.detail?.value;
      if (!locale || locale === this.selectedLocale) return;
      await localizationService.setLocale(locale);
      this.selectedLocale = locale;
    },

    /* ---------- Navigation ---------- */
    isActive(name: string): boolean {
      return this.$route?.name === name;
    },
    isTabActive(tab: NavDestination): boolean {
      return (this.$route?.path ?? "").startsWith(`/tabs/${tab}`);
    },
    tabIcon(tab: NavDestination): string {
      return this.isTabActive(tab) ? navIcons[tab].selected : navIcons[tab].idle;
    },
    async navigate(to: RouteLocationRaw) {
      await menuController.close();
      // Push with direction none like the tab bar: no slide, mounted pages stay mounted.
      // The browser still records a history entry per menu click.
      const nav = this.navManager as IonicNavManager | null;
      if (nav) nav.handleNavigate(to, "push", "none");
      else await this.$router.push(to);
    },
    async logout() {
      await menuController.close();
      await confirmLogout(() => this.logUserOut());
    },

    /* ---------- Dark mode ---------- */
    async toggleDarkModeEvent(e: CustomEvent) {
      await this.toggleDarkMode(e.detail.checked);
    },
    async toggleDarkMode(value: boolean) {
      this.darkMode = value;
      await setDarkMode(value);
    },

    onKeepPhotoChange(e: CustomEvent) {
      this.setKeepPhoto(e.detail.checked);
    },

    /* ---------- Reminders ---------- */
    async openReminders() {
      await menuController.close();
      this.showReminders = true;
    },
    onRemindersDismiss() {
      this.showReminders = false;
      this.releaseReminders();
    },
    openDateSettings() {
      this.showReminders = false;
      this.showDateSettings = true;
    },
  },
});
</script>

<style scoped>
ion-menu {
  --width: var(--menu-width);
  --max-width: 88vw;
  --background: var(--ion-background-color);
}

ion-content {
  --background: var(--ion-background-color);
}

ion-toolbar {
  --background: var(--chrome-bg);
  --color: var(--ion-text-color);
  --border-color: var(--line);
  --border-width: 0 0 1px;
}

ion-header ion-title {
  color: var(--ion-text-color);
}

ion-header :deep(.icon-button) {
  color: var(--ion-color-primary);
  --color: var(--ion-color-primary);
}

ion-footer ion-toolbar {
  --background: var(--ion-background-color);
  --color: var(--ion-text-color);
  --border-width: 1px 0 0;
}

.section {
  padding: var(--space-2) 0;
  background: transparent;
}

.section-title {
  font-size: var(--text-md);
  padding: var(--space-3) var(--space-4) var(--space-1);
  color: var(--ink-soft);
}

ion-item {
  --min-height: var(--tap-min);
  --background: transparent;
  font-size: var(--text-md);
}

ion-item:not(.active) ion-icon[slot="start"] {
  color: var(--nav-idle);
}

ion-item.active {
  --background: var(--leaf-wash);
  font-weight: 600;
}

.reminders-body {
  padding: var(--space-3);
}

/* Collapsed to icons: labels go, badges shrink to a dot on the icon. */
.rail ion-item {
  --padding-start: calc((var(--menu-rail-width) - 24px) / 2);
  --inner-padding-end: 0;
}

.rail ion-item ion-label {
  display: none;
}

.rail ion-item ion-icon[slot="start"] {
  margin-inline-end: 0;
}

.sales-badge {
  --background: var(--new);
  --color: var(--new-ink);
}

.rail ion-item ion-badge {
  position: absolute;
  top: var(--space-2);
  inset-inline-start: calc(18px - var(--menu-rail-width) / 2);
  inset-inline-end: auto;
  min-width: 0;
  width: 10px;
  height: 10px;
  padding: 0;
  font-size: 0;
}

.nav-section {
  display: none;
}

@media (min-width: 992px) {
  .nav-section {
    display: block;
  }
}
</style>
