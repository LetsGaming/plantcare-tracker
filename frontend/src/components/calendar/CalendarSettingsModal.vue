<template>
  <ion-modal :is-open="isOpen" @didDismiss="$emit('close')">
    <modal-header
      :header-title="t('calendar.settings.title')"
      @close="$emit('close')"
    />

    <ion-content>
      <!-- GENERAL SETTINGS -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ t("calendar.settings.general_settings") }}
          </ion-card-title>
        </ion-card-header>

        <ion-card-content>
          <ion-item>
            <ion-select
              :label="t('calendar.settings.first_weekday_label')"
              :value="firstDayOfWeek"
              :placeholder="t('calendar.settings.first_weekday_placeholder')"
              @ionChange="$emit('update:firstDayOfWeek', $event.detail.value)"
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
              @ionChange="
                $emit('update:deleteAfterThirty', $event.detail.checked)
              "
            >
              {{ t("calendar.settings.auto_delete_label") }}
            </ion-toggle>
          </ion-item>
        </ion-card-content>
      </ion-card>

      <!-- WATERING CATEGORIES -->
      <ion-card>
        <ion-card-header>
          <ion-toolbar>
            <ion-title class="ion-text-start">
              {{ t("calendar.settings.watering_categories") }}
            </ion-title>
            <ion-buttons slot="end">
              <ion-button
                fill="clear"
                color="warning"
                @click="$emit('reset-watering-categories')"
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
              <ion-label>{{ t(category.name) }}</ion-label>
              <input
                type="color"
                v-model="category.backgroundColor"
                @input="debouncedUpdateWateringCategories!(index)"
              />
            </ion-item>
          </ion-list>

          <small class="text-muted">
            {{ t("calendar.settings.watering_categories_info") }}
          </small>
        </ion-card-content>
      </ion-card>

      <!-- CATEGORIES -->
      <ion-card>
        <ion-card-header>
          <ion-card-title>
            {{ t("calendar.settings.categories") }}
          </ion-card-title>
        </ion-card-header>

        <ion-card-content>
          <ion-list>
            <ion-item v-for="(category, index) in categories" :key="index">
              <ion-input
                v-model="category.name"
                :placeholder="t('calendar.category.name_placeholder')"
                @ionInput="$emit('update:categories', categories)"
              />

              <input
                type="color"
                v-model="category.backgroundColor"
                @input="debouncedUpdateCategories!(index)"
              />

              <ion-button
                fill="clear"
                color="danger"
                @click="$emit('delete-category', index)"
              >
                <ion-icon :icon="trash" />
              </ion-button>
            </ion-item>
          </ion-list>

          <ion-item>
            <ion-input
              v-model="newCategory.name"
              :placeholder="t('calendar.category.new_placeholder')"
            />
            <input
              type="color"
              v-model="newCategory.backgroundColor"
              @input="setContrastColor(newCategory)"
            />
            <ion-button @click="addCategory">
              {{ t("calendar.category.add_button") }}
            </ion-button>
          </ion-item>
        </ion-card-content>
      </ion-card>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import {
  IonModal,
  IonContent,
  IonItem,
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
  IonList,
  IonInput,
  IonButton,
  IonLabel,
} from "@ionic/vue";
import { trash, refreshCircle } from "ionicons/icons";
import ModalHeader from "../modal/ModalHeader.vue";
import localizationService from "@/services/general/LocalizationService";

import Utils from "@/utils/utils";
import de from "@/locales/de";

export default defineComponent({
  name: "CalendarSettingsModal",
  components: {
    IonModal,
    IonContent,
    IonItem,
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
    IonList,
    IonInput,
    IonButton,
    IonLabel,
    ModalHeader,
  },
  props: {
    isOpen: Boolean,
    firstDayOfWeek: Number,
    doDeleteAfterThirty: Boolean,
    categories: {
      type: Array as PropType<Category[]>,
      required: true,
    },
    wateringCategories: {
      type: Array as PropType<Category[]>,
      required: true,
    },
  },
  emits: [
    "close",
    "update:firstDayOfWeek",
    "update:deleteAfterThirty",
    "update:categories",
    "update:wateringCategories",
    "reset-watering-categories",
    "delete-category",
    "add-category",
  ],
  setup() {
    return { trash, refreshCircle };
  },
  data() {
    return {
      newCategory: {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      } as Category,
      debouncedUpdateCategories: null as ((index: number) => void) | null,
      debouncedUpdateWateringCategories: null as
        | ((index: number) => void)
        | null,
    };
  },
  mounted() {
    this.debouncedUpdateCategories = Utils.debounce((index: number) => {
      this.setContrastColor(this.categories[index]);
      this.$emit("update:categories", this.categories);
    }, 300);

    this.debouncedUpdateWateringCategories = Utils.debounce((index: number) => {
      this.setContrastColor(this.wateringCategories[index]);
      this.$emit("update:wateringCategories", this.wateringCategories);
    }, 500);
  },
  computed: {
    localizedWeekdays() {
      const base = new Date(2021, 7, 1);
      const fmt = new Intl.DateTimeFormat(navigator.language, {
        weekday: "long",
      });
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        return { value: i, label: fmt.format(d) };
      });
    },
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    addCategory() {
      if (!this.newCategory.name.trim()) return;
      this.setContrastColor(this.newCategory);
      this.$emit("add-category", { ...this.newCategory });
      this.newCategory = {
        name: "",
        textColor: "#000000",
        backgroundColor: "#FFFFFF",
      };
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
