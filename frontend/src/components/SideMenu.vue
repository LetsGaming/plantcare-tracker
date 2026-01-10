<template>
  <ion-menu side="start" content-id="main">
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('menu.title') }}</ion-title>
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
          <ion-label>{{ t('menu.profile') }}</ion-label>
        </ion-item>
        <ion-item lines="none">
          <menu-calendar
            :show-settings-button="true"
            @settings-click="showDateSettings = true"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-item lines="none">
          <ion-label>{{ localizationLabel }}</ion-label>
          <ion-select :value="selectedLocale" @ionChange="changeLocale">
            <ion-select-option
              v-for="loc in availableLocales"
              :key="loc"
              :value="loc"
            >
              {{ localeLabel(loc) }}
            </ion-select-option>
          </ion-select>
        </ion-item>
        <ion-item lines="none">
          <ion-toggle
            label-placement="start"
            :checked="darkMode"
            @ionChange="toggleDarkModeEvent"
          >
            {{ t('menu.dark_mode') }}
          </ion-toggle>
        </ion-item>
      </ion-toolbar>
    </ion-footer>
  </ion-menu>
  <calendar-settings-modal
    :is-open="showDateSettings"
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
      darkMode: false,
      closeIcon: close,
      personIcon: person,
      showDateSettings: false,
      selectedLocale: localizationService.getLocale(),
    };
  },
  async mounted() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const storedDark = await storageService.get("darkMode");
      const isDark =
        typeof storedDark === "boolean" ? storedDark : prefersDark.matches;
      this.toggleDarkMode(isDark);
    } catch (error) {
      console.error("Failed to retrieve dark mode preference:", error);
      // Fallback to system preference if retrieval fails
      this.toggleDarkMode(prefersDark.matches);
    }
  },
  methods: {
    async toggleDarkModeEvent(e: CustomEvent) {
      const enableDark = e.detail.checked;
      await this.toggleDarkMode(enableDark);
    },
    async changeLocale(e: CustomEvent) {
      const locale = (e.detail && e.detail.value) || e;
      if (!locale || locale === this.selectedLocale) return;
      try {
        await localizationService.setLocale(locale);
        this.selectedLocale = locale;
      } catch (err) {
        console.error("Failed to change locale", err);
      }
    },
    t(key: string, vars?: Record<string, string | number>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    localeLabel(loc: string) {
      return LOCALE_LABELS[loc] || loc;
    },
    async toggleDarkMode(value: boolean) {
      this.darkMode = value;
      try {
        await storageService.set("darkMode", value);
      } catch (error) {
        console.error("Failed to set dark mode preference:", error);
      }
      document.documentElement.classList.toggle("ion-palette-dark", value);
    },
    async navigateToProfile() {
      this.$router.push({
        name: "profile",
      });
      await menuController.close();
    },
  },
  computed: {
    availableLocales() {
      return localizationService.availableLocales();
    },
    localizationLabel() {
      return localizationService.t("label.language", undefined, "Language");
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
