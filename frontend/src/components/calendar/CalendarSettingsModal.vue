<template>
  <ion-modal :is-open="isOpen" @didDismiss="$emit('close')">
    <modal-header
      header-title="Kalender Einstellungen"
      @close="$emit('close')"
    />

    <ion-content>
      <!-- Categories List Section -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Kategorien</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(category, index) in categories" :key="index">
              <ion-label>{{ category.name }}</ion-label>
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

      <!-- Reminder Dates Section -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>Erinnerungen</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <ion-list>
            <ion-item v-for="(date, index) in reminderDates" :key="index">
              <ion-grid>
                <ion-row>
                  <ion-col>
                    <ion-label>{{ date.date }}</ion-label>
                  </ion-col>
                  <ion-col>
                    <ion-label>{{ date.category }}</ion-label>
                  </ion-col>
                </ion-row>
              </ion-grid>

              <ion-button fill="clear" @click="editDate(index)">
                <ion-icon :icon="create" />
              </ion-button>
              <ion-button
                fill="clear"
                color="danger"
                @click="deleteDate(index)"
              >
                <ion-icon :icon="trash" />
              </ion-button>
            </ion-item>
          </ion-list>

          <!-- Edit Date Section -->
          <ion-item v-if="isEditingDate">
            <ion-item>
              <ion-input
                v-model="editedDate.date"
                type="date"
                placeholder="Wählen Sie ein Datum"
              />
            </ion-item>

            <ion-select
              v-model="editedDate.category"
              placeholder="Wählen Sie eine Kategorie"
            >
              <ion-select-option
                v-for="category in categories"
                :key="category.name"
                :value="category.name"
              >
                {{ category.name }}
              </ion-select-option>
            </ion-select>
            <ion-button @click="updateDate()">Aktualisieren</ion-button>
            <ion-button @click="cancelEditDate()" color="medium"
              >Abbrechen</ion-button
            >
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
} from "@ionic/vue";
import { create, trash } from "ionicons/icons";
import ModalHeader from "../modal/ModalHeader.vue";
import storageService from "@/services/general/StorageService";
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
      editDateIndex: -1,
      editedDate: {
        date: "",
        category: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      } as CalendarDates,
    };
  },
  setup() {
    return { create, trash };
  },
  async mounted() {
    await this.loadCategories();
    await this.loadDates();
  },
  methods: {
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
          if (date.category === oldCategoryName) {
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
    async deleteDate(index: number) {
      this.reminderDates.splice(index, 1);
      await this.saveDates();
    },

    editDate(index: number) {
      const dateToEdit = this.reminderDates[index];
      this.editedDate = { ...dateToEdit };
      this.isEditingDate = true;
      this.editDateIndex = index;
    },

    async updateDate() {
      if (this.editDateIndex > -1) {
        const category = this.categories.find(
          (category) => category.name === this.editedDate.category
        );
        if (!category) {
          return;
        }

        this.reminderDates[this.editDateIndex] = {
          date: this.editedDate.date,
          category: this.editedDate.category,
          textColor: category.textColor,
          backgroundColor: category.backgroundColor,
        };
        await this.saveDates();
        this.cancelEditDate();
      }
    },

    cancelEditDate() {
      this.editedDate = {
        date: "",
        category: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      };
      this.isEditingDate = false;
      this.editDateIndex = -1;
    },

    // Color contrast logic
    setContrastColor(newCategory: Category) {
      const bgColor = newCategory.backgroundColor;
      function hexToRgb(hex: string): [number, number, number] {
        hex = hex.replace(/^#/, "");
        if (hex.length === 3) {
          hex = hex
            .split("")
            .map((char) => char + char)
            .join("");
        }
        const bigint = parseInt(hex, 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
      }

      function getLuminance([r, g, b]: [number, number, number]): number {
        const a = [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }

      function getContrastRatio(l1: number, l2: number): number {
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }

      function generateColor(contrastWithBg: number): string {
        let r, g, b;
        // We want to generate bright or dark colors depending on the background
        if (contrastWithBg > 0.5) {
          // Generate dark color if the background is light
          r = Math.floor(Math.random() * 100); // Darker red
          g = Math.floor(Math.random() * 100); // Darker green
          b = Math.floor(Math.random() * 100); // Darker blue
        } else {
          // Generate bright color if the background is dark
          r = Math.floor(Math.random() * 156) + 100; // Lighter red
          g = Math.floor(Math.random() * 156) + 100; // Lighter green
          b = Math.floor(Math.random() * 156) + 100; // Lighter blue
        }
        return `rgb(${r}, ${g}, ${b})`;
      }

      const bgRgb = hexToRgb(bgColor);
      const bgLuminance = getLuminance(bgRgb);

      // Generate a color with contrast against the background color
      const contrastColor = generateColor(bgLuminance);

      // Ensure that the contrast ratio with the background is high enough (contrast ratio > 4.5 is good for readability)
      const contrastWithBg = getContrastRatio(
        getLuminance(bgRgb),
        getLuminance(
          hexToRgb(
            contrastColor.replace(
              /^rgb\((\d+), (\d+), (\d+)\)$/,
              (_, r, g, b) => `${r},${g},${b}`
            )
          )
        )
      );

      if (contrastWithBg < 4.5) {
        // If contrast is not high enough, tweak the color (e.g., make it brighter/darker)
        return generateColor(bgLuminance); // Re-generate a color with a better contrast ratio
      }

      newCategory.textColor = contrastColor;
    },
  },
});
</script>
