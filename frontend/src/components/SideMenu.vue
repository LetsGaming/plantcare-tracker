<template>
  <ion-menu side="start" content-id="main" menu-id="main-menu" :aria-label="t('shell.menu_label')">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t("menu.title") }}</ion-title>
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
        <h2 class="section-title">{{ t("chrome.section_navigation") }}</h2>
        <ion-item
          v-for="dest in destinations"
          :key="dest.tab"
          button
          :class="{ active: isTabActive(dest.tab) }"
          :aria-current="isTabActive(dest.tab) ? 'page' : undefined"
          @click="navigate(`/tabs/${dest.tab}`)"
        >
          <ion-icon slot="start" :icon="tabIcon(dest.tab)" aria-hidden="true" />
          <ion-label>{{ t(dest.label) }}</ion-label>
          <ion-badge
            v-if="dest.tab === 'sales' && salesCount > 0"
            slot="end"
            color="secondary"
            :aria-label="t('tabs.sales_new', { count: salesCount })"
          >
            {{ salesCount }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <ion-list lines="none" class="section">
        <h2 class="section-title">{{ t("shell.section_account") }}</h2>
        <ion-item
          button
          :class="{ active: isActive('profile') }"
          :aria-current="isActive('profile') ? 'page' : undefined"
          @click="navigate({ name: 'profile' })"
        >
          <ion-icon slot="start" :icon="personIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.profile") }}</ion-label>
        </ion-item>
      </ion-list>

      <ion-list v-if="isAdmin" lines="none" class="section">
        <h2 class="section-title">{{ t("shell.section_admin") }}</h2>
        <ion-item
          button
          :class="{ active: isActive('admin-dashboard') }"
          :aria-current="isActive('admin-dashboard') ? 'page' : undefined"
          @click="navigate({ name: 'admin-dashboard' })"
        >
          <ion-icon slot="start" :icon="settingsIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.admin_dashboard") }}</ion-label>
        </ion-item>
        <ion-item
          button
          :class="{ active: isActive('admin-scrapers') }"
          :aria-current="isActive('admin-scrapers') ? 'page' : undefined"
          @click="navigate({ name: 'admin-scrapers' })"
        >
          <ion-icon slot="start" :icon="pulseIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.admin_scrapers") }}</ion-label>
          <ion-badge v-if="failingSources > 0" slot="end" :color="failingColor">
            {{ t("shell.scrapers_failing", { count: failingSources }) }}
          </ion-badge>
        </ion-item>
      </ion-list>

      <div class="section calendar">
        <menu-calendar :show-settings-button="true" @settings-click="showDateSettings = true" />
      </div>

      <ion-list lines="none" class="section">
        <h2 class="section-title">{{ t("shell.section_preferences") }}</h2>
        <ion-item>
          <ion-select
            :label="t('shell.language')"
            label-placement="start"
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
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-item button lines="none" @click="logout">
          <ion-icon slot="start" :icon="logOutIcon" aria-hidden="true" />
          <ion-label>{{ t("shell.logout") }}</ion-label>
        </ion-item>
      </ion-toolbar>
    </ion-footer>
  </ion-menu>

  <calendar-settings-modal
    :is-open="showDateSettings"
    :first-day-of-week="firstDayOfWeek"
    :do-delete-after-thirty="doDeleteAfterThirty"
    :categories="categories"
    :watering-categories="wateringCategories"
    @update:firstDayOfWeek="updateFirstDayOfWeek"
    @update:deleteAfterThirty="updateDeleteAfterThirty"
    @update:categories="updateCategories"
    @update:wateringCategories="updateWateringCategories"
    @reset-watering-categories="resetWateringCategories"
    @add-category="addCategory"
    @delete-category="deleteCategory"
    @close="showDateSettings = false"
  />
</template>

<script lang="ts">
import { defineComponent } from "vue";
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
  menuController,
} from "@ionic/vue";
import { icons, navIcons, type NavDestination } from "@/theme/icons";

import MenuCalendar from "./calendar/MenuCalendar.vue";
import CalendarSettingsModal from "./calendar/CalendarSettingsModal.vue";
import IconButton from "@/components/ui/IconButton.vue";

import { isDarkMode, setDarkMode } from "@/theme/darkMode";
import localizationService from "@/services/general/LocalizationService";
import { mapActions, mapState } from "pinia";
import { useCalendarStore } from "@/stores/calendar";
import { useSessionStore } from "@/stores/session";
import { useSalesStore } from "@/stores/sales";
import { useAdminHealthStore } from "@/stores/adminHealth";
import { confirmLogout } from "@/utils/confirmLogout";
import { statusIonColor } from "@/utils/sourceStatus";
import type { RouteLocationRaw } from "vue-router";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  de: "Deutsch",
};

export default defineComponent({
  name: "SideMenu",
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
    MenuCalendar,
    CalendarSettingsModal,
  },

  data() {
    return {
      // UI
      darkMode: false,
      failingColor: statusIonColor("failing"),
      closeIcon: icons.close,
      personIcon: icons.profile,
      logOutIcon: icons.logout,
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
    ...mapState(useAdminHealthStore, { failingSources: "needingAttention" }),
    ...mapState(useCalendarStore, {
      firstDayOfWeek: "firstDayOfWeek",
      doDeleteAfterThirty: "deleteAfterThirty",
      categories: "categories",
      wateringCategories: "wateringCategories",
    }),
    availableLocales() {
      return localizationService.availableLocales();
    },
    localizationLabel() {
      return localizationService.t("label.language", undefined, "Language");
    },
  },

  methods: {
    ...mapActions(useSessionStore, { logUserOut: "logout" }),
    ...mapActions(useCalendarStore, {
      ensureCalendarLoaded: "ensureLoaded",
      deleteOldDates: "deleteOldDates",
      saveFirstDayOfWeek: "saveFirstDayOfWeek",
      saveDeleteAfterThirty: "saveDeleteAfterThirty",
      saveCategories: "saveCategories",
      saveWateringCategories: "saveWateringCategories",
      resetWateringCategories: "resetWateringCategories",
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
      await this.$router.push(to);
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

    /* ---------- Calendar logic ---------- */
    updateFirstDayOfWeek(value: number) {
      this.saveFirstDayOfWeek(value);
    },

    updateDeleteAfterThirty(value: boolean) {
      this.saveDeleteAfterThirty(value);
    },

    updateCategories(categories: Category[]) {
      this.saveCategories(categories);
    },

    updateWateringCategories(categories: Category[]) {
      this.saveWateringCategories(categories);
    },

    addCategory(category: Category) {
      this.saveCategories([...this.categories, category]);
    },

    deleteCategory(index: number) {
      this.saveCategories(this.categories.filter((_, i) => i !== index));
    },
  },
});
</script>

<style scoped>
ion-menu {
  --width: 320px;
  --max-width: 88vw;
  --background: var(--ion-background-color);
}

ion-content {
  --background: var(--ion-background-color);
}

ion-toolbar {
  --background: var(--ion-color-primary);
  --color: var(--ion-color-primary-contrast);
  --border-width: 0;
}

ion-header ion-title,
ion-header :deep(.icon-button) {
  color: var(--ion-color-primary-contrast);
  --color: var(--ion-color-primary-contrast);
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

ion-item.active {
  --background: var(--leaf-wash);
  font-weight: 600;
}

.calendar {
  padding-inline: var(--space-3);
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
