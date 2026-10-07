<template>
  <ion-menu side="start" content-id="main">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t("menu.title") }}</ion-title>
        <ion-buttons slot="end">
          <ion-menu-toggle>
            <ion-button>
              <ion-icon slot="icon-only" :icon="closeIcon" />
            </ion-button>
          </ion-menu-toggle>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        <ion-item button @click="navigateToProfile">
          <ion-icon slot="start" :icon="personIcon" />
          <ion-label>{{ t("menu.profile") }}</ion-label>
        </ion-item>

        <ion-item lines="none">
          <menu-calendar :show-settings-button="true" @settings-click="showDateSettings = true" />
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-item lines="none">
          <ion-label>{{ localizationLabel }}</ion-label>
          <ion-select :value="selectedLocale" @ionChange="changeLocale">
            <ion-select-option v-for="loc in availableLocales" :key="loc" :value="loc">
              {{ localeLabel(loc) }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-toggle label-placement="start" :checked="darkMode" @ionChange="toggleDarkModeEvent">
            {{ t("menu.dark_mode") }}
          </ion-toggle>
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
  IonButton,
  IonIcon,
  IonLabel,
  IonToggle,
  IonFooter,
  menuController,
} from "@ionic/vue";
import { close, person } from "ionicons/icons";

import MenuCalendar from "./calendar/MenuCalendar.vue";
import CalendarSettingsModal from "./calendar/CalendarSettingsModal.vue";

import storageService from "@/services/general/StorageService";
import localizationService from "@/services/general/LocalizationService";
import { mapActions, mapState } from "pinia";
import { useCalendarStore } from "@/stores/calendar";

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
    IonButton,
    IonIcon,
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
      closeIcon: close,
      personIcon: person,
      showDateSettings: false,

      // Localization
      selectedLocale: localizationService.getLocale(),
    };
  },

  async mounted() {
    /* ---------- Dark mode ---------- */
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const storedDark = await storageService.get("darkMode");
      const isDark = typeof storedDark === "boolean" ? storedDark : prefersDark.matches;
      this.toggleDarkMode(isDark);
    } catch (error) {
      console.error("Failed to retrieve dark mode preference:", error);
      this.toggleDarkMode(prefersDark.matches);
    }

    /* ---------- Calendar settings ---------- */
    await this.ensureCalendarLoaded();
    this.deleteOldDates();
  },

  computed: {
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
    async navigateToProfile() {
      this.$router.push({ name: "profile" });
      await menuController.close();
    },

    /* ---------- Dark mode ---------- */
    async toggleDarkModeEvent(e: CustomEvent) {
      await this.toggleDarkMode(e.detail.checked);
    },
    async toggleDarkMode(value: boolean) {
      this.darkMode = value;
      await storageService.set("darkMode", value);
      document.documentElement.classList.toggle("ion-palette-dark", value);
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
  --width: 15%;
}

@media (max-width: 1920px) {
  ion-menu {
    --width: 20%;
  }
}

@media (max-width: 768px) {
  ion-menu {
    --width: 80%;
  }
}
</style>
