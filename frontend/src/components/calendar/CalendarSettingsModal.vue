<template>
  <ion-modal :is-open="isOpen" @didDismiss="$emit('close')">
    <modal-header
      header-title="Kalender Einstellungen"
      @close="$emit('close')"
    />

    <ion-content>
      <ion-card>
        <ion-card-header>
          <ion-card-title>Allgemeine Einstellungen</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-select
              label="Erster Wochentag"
              :value="firstDayOfWeek"
              placeholder="Wähle den ersten Wochentag"
              @ionChange="saveFirstDayOfWeek"
            >
              <ion-select-option
                v-for="weekday in localizedWeekdays"
                :key="weekday.value"
                :value="weekday.value"
              >
                {{ weekday.label }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-toggle
              :checked="doDeleteAfterThirty"
              v-model="doDeleteAfterThirty"
              @ionChange="toggleAutoDelete"
            >
              Automatisches Löschen nach 30 Tagen
            </ion-toggle>
          </ion-item>
        </ion-card-content>
      </ion-card>
      <ion-card>
        <ion-card-header>
          <ion-toolbar>
            <ion-title class="ion-text-start">Wässerungskategorien</ion-title>
            <ion-buttons slot="end">
              <ion-button
                fill="clear"
                color="warning"
                @click="resetWateringCategories"
              >
                <ion-icon :icon="refreshCircle" />
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-card-header>

        <ion-card-content>
          <ion-list>
            <ion-item
              v-for="(category, index) in wateringCategories"
              :key="index"
            >
              <ion-label>{{ category.name }}</ion-label>
              <input
                type="color"
                v-model="category.backgroundColor"
                @input="() => handleWateringCategoryColorChange(index)"
              />
            </ion-item>
          </ion-list>
          <small class="text-muted">
            Namen und Anzahl dieser Kategorien sind festgelegt – nur die Farbe
            kann angepasst werden.
          </small>
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-header>
          <ion-card-title>Kategorien</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(category, index) in categories" :key="index">
              <ion-input
                v-model="category.name"
                placeholder="Kategorie Name"
                @input="saveCategories"
                style="width: 90%; margin-right: 10px"
              />
              <input
                type="color"
                v-model="category.backgroundColor"
                @input="() => handleCategoryColorChange(index)"
              />
              <ion-item lines="none">
                <ion-button
                  fill="clear"
                  color="danger"
                  @click="deleteCategory(index)"
                >
                  <ion-icon :icon="trash" />
                </ion-button>
              </ion-item>
            </ion-item>
          </ion-list>

          <ion-item>
            <ion-input
              v-model="newCategory.name"
              placeholder="Neue Kategorie"
            />
            <input
              type="color"
              v-model="newCategory.backgroundColor"
              @input="setContrastColor(newCategory)"
            />
            <ion-button @click="saveCategory"> Hinzufügen </ion-button>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {
  IonModal,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonToolbar,
  IonButtons,
  IonTitle,
} from "@ionic/vue";
import { create, trash, refreshCircle } from "ionicons/icons";
import ModalHeader from "../modal/ModalHeader.vue";
import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "CalendarSettingsModal",
  emits: ["close", "update:categories", "update:dates"],
  props: { isOpen: Boolean },
  components: {
    IonModal,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonToolbar,
    IonButtons,
    IonTitle,
    ModalHeader,
  },
  setup() {
    return { create, trash, refreshCircle };
  },
  data() {
    return {
      categories: [] as Category[],
      wateringCategories: [] as Category[],
      newCategory: {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      } as Category,
      doDeleteAfterThirty: false,
      firstDayOfWeek: 0,
    };
  },
  async mounted() {
    this.doDeleteAfterThirty = await CalendarService.getDeleteAfterThirty();
    await CalendarService.deleteOldDates();
    await this.loadCategories();
    this.firstDayOfWeek = await CalendarService.getFirstDayOfWeek().catch(
      () => 0
    );
  },
  computed: {
    localizedWeekdays(): { value: number; label: string }[] {
      const baseDate = new Date(2021, 7, 1); // Sunday
      const formatter = new Intl.DateTimeFormat(navigator.language, {
        weekday: "long",
      });
      return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);
        return { value: i, label: formatter.format(date) };
      });
    },
  },
  methods: {
    /** GENERAL SETTINGS **/
    async saveFirstDayOfWeek(event: CustomEvent) {
      this.firstDayOfWeek = event.detail.value;
      await CalendarService.saveFirstDayOfWeek(this.firstDayOfWeek);
    },
    async toggleAutoDelete(event: CustomEvent) {
      this.doDeleteAfterThirty = event.detail.checked;
      await CalendarService.saveDeleteAfterThirty(this.doDeleteAfterThirty);
    },

    /** CATEGORIES **/
    async loadCategories() {
      this.categories = await CalendarService.getCategories();
      this.wateringCategories = await CalendarService.getWateringCategories();
    },
    async saveCategories() {
      await CalendarService.saveCategories(this.categories);
    },
    async saveCategory() {
      if (!this.newCategory.name.trim()) return;
      this.setContrastColor(this.newCategory);
      this.categories.push({ ...this.newCategory });
      await this.saveCategories();
      this.newCategory = {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      };
    },
    async deleteCategory(index: number) {
      this.categories.splice(index, 1);
      await this.saveCategories();
    },
    handleCategoryColorChange(index: number) {
      this.setContrastColor(this.categories[index]);
      this.saveCategories();
    },

    /** WATERING CATEGORIES **/
    async saveWateringCategories() {
      await CalendarService.saveWateringCategories(this.wateringCategories);
    },
    async resetWateringCategories() {
      await CalendarService.resetWateringCategories();
      this.wateringCategories = await CalendarService.getWateringCategories();
    },
    handleWateringCategoryColorChange(index: number) {
      this.setContrastColor(this.wateringCategories[index]);
      this.saveWateringCategories();
    },

    /** COLOR HELPERS **/
    setContrastColor(category: Category) {
      function hexToHsl(hex: string): [number, number, number] {
        let r = parseInt(hex.substring(1, 3), 16) / 255;
        let g = parseInt(hex.substring(3, 5), 16) / 255;
        let b = parseInt(hex.substring(5, 7), 16) / 255;
        let max = Math.max(r, g, b),
          min = Math.min(r, g, b);
        let h = 0,
          s = 0,
          l = (max + min) / 2;
        if (max !== min) {
          let d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r:
              h = (g - b) / d + (g < b ? 6 : 0);
              break;
            case g:
              h = (b - r) / d + 2;
              break;
            case b:
              h = (r - g) / d + 4;
              break;
          }
          h /= 6;
        }
        return [h * 360, s, l];
      }
      function hslToHex(h: number, s: number, l: number): string {
        let r, g, b;
        function hueToRgb(p: number, q: number, t: number) {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1 / 6) return p + (q - p) * 6 * t;
          if (t < 1 / 2) return q;
          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
          return p;
        }
        if (s === 0) {
          r = g = b = l;
        } else {
          let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
          let p = 2 * l - q;
          r = hueToRgb(p, q, h / 360 + 1 / 3);
          g = hueToRgb(p, q, h / 360);
          b = hueToRgb(p, q, h / 360 - 1 / 3);
        }
        return (
          "#" +
          (
            (1 << 24) +
            (Math.round(r * 255) << 16) +
            (Math.round(g * 255) << 8) +
            Math.round(b * 255)
          )
            .toString(16)
            .slice(1)
        );
      }
      let [h, s, l] = hexToHsl(category.backgroundColor);
      h = (h + 180) % 360;
      s = Math.max(0.6, s);
      l = l > 0.5 ? 0.2 : 0.8;
      category.textColor = hslToHex(h, s, l);
    },
  },
});
</script>
