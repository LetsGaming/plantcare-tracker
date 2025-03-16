<template>
  <ion-menu side="start" content-id="main">
    <ion-header>
      <ion-toolbar>
        <ion-title>Menu</ion-title>
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
          <ion-label>Profil</ion-label>
        </ion-item>
        <ion-item lines="none">
          <calendar
            :show-settings-button="true"
            @settings-click="showDateSettings = true"
          />
        </ion-item>
      </ion-list>
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <ion-item lines="none">
          <ion-toggle
            label-placement="start"
            :checked="darkMode"
            @ionChange="toggleDarkModeEvent"
          >
            Dark Mode
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
import Calendar from "./calendar/Calendar.vue";
import CalendarSettingsModal from "./calendar/CalendarSettingsModal.vue";

import storageService from "@/services/general/StorageService";

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
    IonButtons,
    IonMenuToggle,
    IonButton,
    IonIcon,
    IonLabel,
    IonToggle,
    IonFooter,
    Calendar,
    CalendarSettingsModal,
  },
  data() {
    return {
      darkMode: false,
      closeIcon: close,
      personIcon: person,
      showDateSettings: false,
    };
  },
  async mounted() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    try {
      const storedDark = await storageService.get("dark_mode");
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
    async toggleDarkMode(value: boolean) {
      this.darkMode = value;
      try {
        await storageService.set("dark_mode", value);
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
});
</script>
