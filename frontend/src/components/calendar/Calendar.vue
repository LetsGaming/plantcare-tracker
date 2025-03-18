<template>
  <div>
    <ion-card>
      <ion-card-header>
        <ion-toolbar>
          <ion-title>Erinnerungen</ion-title>
          <ion-icon
            v-if="showSettingsButton"
            slot="end"
            :icon="settings"
            @click="$emit('settings-click')"
          />
        </ion-toolbar>
      </ion-card-header>
      <ion-card-content>
        <ion-datetime
          v-model="selectedDate"
          presentation="date"
          :highlighted-dates="reminderDates"
          :first-day-of-week="firstDayOfWeek"
        ></ion-datetime>

        <!-- Dropdown für Kategorien -->
        <ion-select
          v-model="selectedCategory"
          placeholder="Kategorie auswählen"
        >
          <ion-select-option
            v-for="cat in categories"
            :key="cat.name"
            :value="cat"
          >
            {{ cat.name }}
          </ion-select-option>
        </ion-select>

        <ion-button expand="full" @click="addDate"
          >Erinnerung hinzufügen</ion-button
        >
      </ion-card-content>
    </ion-card>
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonDatetime,
  IonButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonIcon,
  IonToolbar,
} from "@ionic/vue";
import { settings } from "ionicons/icons";
import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "Calendar",
  emits: ["settings-click"],
  components: {
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonDatetime,
    IonButton,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonIcon,
    IonToolbar,
  },
  props: {
    showSettingsButton: {
      type: Boolean,
      default: false,
    },
  },
  setup() {
    return {
      settings,
    };
  },
  data() {
    return {
      selectedDate: "",
      selectedCategory: null as {
        name: string;
        textColor: string;
        backgroundColor: string;
      } | null,
      // Gespeicherte Reminder-Daten
      reminderDates: [] as CalendarDates[],
      // Vordefinierte Kategorien mit eigenen Farben
      categories: [] as Category[],
      firstDayOfWeek: 0,
    };
  },
  async mounted() {
    this.setupListeners();
    await this.getFirstDay();
    await this.getSavedDates();
    await this.getSavedCategories();
  },
  methods: {
    setupListeners() {
      document.addEventListener("categories-changed", (event) => {
        const customEvent = event as CustomEvent<Category[]>;
        this.categories = customEvent.detail;
      });
      document.addEventListener("dates-changed", (event) => {
        const customEvent = event as CustomEvent<CalendarDates[]>;
        this.reminderDates = [];
        this.$nextTick(() => {
          this.reminderDates = customEvent.detail;
        });
      });
      document.addEventListener("first-day-of-week-changed", (event) => {
        const customEvent = event as CustomEvent<number>;
        this.firstDayOfWeek = customEvent.detail;
      });
    },
    async getFirstDay() {
      this.firstDayOfWeek = await CalendarService.getFirstDayOfWeek();
    },
    async getSavedDates() {
      this.reminderDates = await CalendarService.getDates();
    },
    async getSavedCategories() {
      this.categories = await CalendarService.getCategories();
    },
    addDate() {
      if (!this.selectedDate || !this.selectedCategory) {
        // Optional: Hier könnte eine Fehlermeldung an den Nutzer ausgegeben werden, falls Datum oder Kategorie nicht ausgewählt wurde.
        return;
      }
      // Extrahiere das Datum ohne Zeitanteil
      const dateWithoutTime = new Date(this.selectedDate)
        .toISOString()
        .split("T")[0];
      // Verwende die Farben der ausgewählten Kategorie
      this.reminderDates.push({
        date: dateWithoutTime,
        category: this.selectedCategory.name,
        textColor: this.selectedCategory.textColor,
        backgroundColor: this.selectedCategory.backgroundColor,
      });
      // Reset der Eingabefelder
      this.selectedDate = "";
      this.saveDates();
    },
    async saveDates() {
      await CalendarService.saveDates(this.reminderDates);
    },
  },
});
</script>
