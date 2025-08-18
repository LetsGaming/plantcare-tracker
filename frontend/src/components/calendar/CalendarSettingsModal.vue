<template>
  <ion-modal :is-open="isOpen" @didDismiss="$emit('close')">
    <modal-header
      header-title="Kalender Einstellungen"
      @close="$emit('close')"
    />

    <ion-content>
      <!-- First Day of the Week Setting -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Generelle Einstellungen</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-item>
            <ion-select
              v-model="firstDayOfWeek"
              label="Wochentag auswählen"
              placeholder="Wählen Sie einen Tag"
              @ionChange="updateFirstDay"
            >
              <ion-select-option :value="0">Sonntag</ion-select-option>
              <ion-select-option :value="1">Montag</ion-select-option>
              <ion-select-option :value="2">Dienstag</ion-select-option>
              <ion-select-option :value="3">Mittwoch</ion-select-option>
              <ion-select-option :value="4">Donnerstag</ion-select-option>
              <ion-select-option :value="5">Freitag</ion-select-option>
              <ion-select-option :value="6">Samstag</ion-select-option>
            </ion-select>
          </ion-item>
          <IonItem>
            <IonToggle
              :checked="doDeleteAfterThirty"
              label-placement="start"
              @ion-change="setDelete"
              >Erinnerungen nach 30 Tagen löschen?</IonToggle
            >
          </IonItem>
        </ion-card-content>
      </ion-card>

      <!-- Categories List Section -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Kategorien</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(category, index) in categories" :key="index">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-label>{{ category.name }}</ion-label>
                  </ion-col>
                  <ion-col>
                    <input
                      v-model="category.backgroundColor"
                      type="color"
                      :disabled="true"
                    />
                  </ion-col>
                </ion-row>
              </ion-grid>
              <ion-button fill="clear" @click="editCategory(index)">
                <ion-icon :icon="create" />
              </ion-button>
              <ion-button
                fill="clear"
                color="danger"
                @click="deleteCategory(index)"
              >
                <ion-icon :icon="trash" />
              </ion-button>
            </ion-item>
          </ion-list>

          <!-- Add or Edit Category Section -->
          <ion-item>
            <ion-input
              v-model="newCategory.name"
              :placeholder="
                isEditingCategory ? 'Kategorie bearbeiten' : 'Neue Kategorie'
              "
            />
            <input
              type="color"
              v-model="newCategory.backgroundColor"
              @input="setContrastColor(newCategory)"
            />
            <ion-button
              @click="isEditingCategory ? updateCategory() : addCategory()"
            >
              {{ isEditingCategory ? "Aktualisieren" : "Hinzufügen" }}
            </ion-button>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent, h } from "vue";
import {
  IonModal,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonIcon,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonGrid,
  IonRow,
  IonCol,
  IonSelect,
  IonSelectOption,
  IonToggle,
} from "@ionic/vue";
import { create, trash } from "ionicons/icons";
import ModalHeader from "../modal/ModalHeader.vue";
import CalendarService from "@/services/CalendarService";

export default defineComponent({
  name: "CalendarSettingsModal",
  emits: ["close", "update:categories", "update:dates"],
  components: {
    IonModal,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonIcon,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonGrid,
    IonRow,
    IonCol,
    ModalHeader,
    IonSelect,
    IonSelectOption,
    IonToggle,
  },
  props: { isOpen: Boolean },
  data() {
    return {
      categories: [] as Category[],
      reminderDates: [] as CalendarDates[],
      newCategory: {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      } as Category,
      isEditingCategory: false,
      isEditingDate: false,
      editCategoryIndex: -1,
      doDeleteAfterThirty: false,
      // New setting for first day of the week (0 = Sonntag, 1 = Montag, etc.)
      firstDayOfWeek: 0,
    };
  },
  setup() {
    return { create, trash };
  },
  async mounted() {
    document.addEventListener(
      "dates-changed",
      this.handleDatesChanged as EventListener
    );
    this.doDeleteAfterThirty = await CalendarService.getDeleteAfterThirty();
    await CalendarService.deleteOldDates();
    await this.loadCategories();
    await this.loadDates();
    // Load saved first day of the week, defaulting to 0 (Sonntag) if not set
    this.firstDayOfWeek = await CalendarService.getFirstDayOfWeek().catch(
      () => 0
    );
  },
  methods: {
    // First Day of Week Methods
    async updateFirstDay() {
      await CalendarService.saveFirstDayOfWeek(this.firstDayOfWeek);
    },

    // Categories Methods
    async loadCategories() {
      this.categories = await CalendarService.getCategories();
    },
    async saveCategories() {
      await CalendarService.saveCategories(this.categories);
    },
    async addCategory() {
      if (this.newCategory.name.trim()) {
        this.categories.push({ ...this.newCategory });
        this.resetCategoryForm();
        await this.saveCategories();
      }
    },
    async deleteCategory(index: number) {
      this.categories.splice(index, 1);
      await this.saveCategories();
    },
    editCategory(index: number) {
      this.newCategory = { ...this.categories[index] };
      this.isEditingCategory = true;
      this.editCategoryIndex = index;
    },
    async updateCategory() {
      if (this.editCategoryIndex > -1) {
        const updatedCategory = { ...this.newCategory };
        const oldCategoryName = this.categories[this.editCategoryIndex].name;

        // Update category in the list
        this.categories[this.editCategoryIndex] = updatedCategory;

        // Update reminder dates that use this category
        this.reminderDates = this.reminderDates.map((date) => {
          if (date.category && date.category.name === oldCategoryName) {
            return {
              ...date,
              textColor: updatedCategory.textColor,
              backgroundColor: updatedCategory.backgroundColor,
            };
          }
          return date;
        });

        await this.saveCategories();
        await this.saveDates(); // Save updated dates
        this.resetCategoryForm();
      }
    },
    resetCategoryForm() {
      this.newCategory = {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      };
      this.isEditingCategory = false;
      this.editCategoryIndex = -1;
    },

    // Dates Methods
    async loadDates() {
      this.reminderDates = await CalendarService.getDates();
    },
    async saveDates() {
      await CalendarService.saveDates(this.reminderDates);
    },
    handleDatesChanged(event: CustomEvent<CalendarDates[]>) {
      this.reminderDates = event.detail;
    },
    async deleteDate(index: number) {
      this.reminderDates.splice(index, 1);
      await this.saveDates();
    },
    // Color contrast logic
    setContrastColor(newCategory: Category) {
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

        return [h * 360, s, l]; // Convert h to degrees
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

      let [h, s, l] = hexToHsl(newCategory.backgroundColor);

      // Adjust hue to a contrasting color (shift by 180° for best contrast)
      h = (h + 180) % 360;

      // Ensure saturation is high enough for vibrant color
      s = Math.max(0.6, s);

      // Ensure brightness is in contrast with the background
      l = l > 0.5 ? 0.2 : 0.8;

      newCategory.textColor = hslToHex(h, s, l);
    },
    async setDelete(event: CustomEvent) {
      this.doDeleteAfterThirty = event.detail.checked;
      await CalendarService.saveDeleteAfterThirty(this.doDeleteAfterThirty);
    },
  },
});
</script>
