<template>
  <ion-modal v-if="mounted" :is-open="isOpen" @didDismiss="onDidDismiss">
    <modal-header :header-title="t('calendar.settings.title')" @close="$emit('close')" />

    <ion-content>
      <div class="settings-column">
        <section class="settings-card">
          <h2 class="settings-heading">{{ t("calendar.settings.general_settings") }}</h2>

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
              justify="space-between"
              :checked="doDeleteAfterThirty"
              @ionChange="$emit('update:deleteAfterThirty', $event.detail.checked)"
            >
              {{ t("calendar.settings.auto_delete_label") }}
            </ion-toggle>
          </ion-item>
        </section>

        <section class="settings-card">
          <div class="settings-heading-row">
            <h2 class="settings-heading">{{ t("modal2.watering_categories") }}</h2>
            <ion-button size="small" fill="outline" color="medium" @click="showResetConfirm = true">
              <ion-icon slot="start" :icon="refreshOutline" aria-hidden="true" />
              {{ t("modal2.reset_colors") }}
            </ion-button>
          </div>

          <ion-list>
            <ion-item v-for="(category, index) in localWatering" :key="index">
              <ion-label>{{ t(category.name) }}</ion-label>
              <input
                v-model="category.backgroundColor"
                type="color"
                class="color-input"
                :aria-label="t('calendar2.color_for', { name: t(category.name) })"
                @input="debouncedUpdateWateringCategories(index)"
              />
            </ion-item>
          </ion-list>

          <p class="settings-note">{{ t("calendar.settings.watering_categories_info") }}</p>
        </section>

        <section class="settings-card">
          <h2 class="settings-heading">{{ t("modal2.reminder_categories") }}</h2>

          <p v-if="localCategories.length === 0" class="settings-note">
            {{ t("modal2.no_reminder_categories") }}
          </p>

          <ion-list v-if="localCategories.length > 0">
            <div v-for="(category, index) in localCategories" :key="index" class="category-row">
              <ion-item lines="full">
                <ion-input
                  v-model="category.name"
                  :aria-label="t('calendar2.category_name')"
                  :placeholder="t('calendar.category.name_placeholder')"
                  autocapitalize="words"
                  autocorrect="off"
                  :aria-invalid="nameErrors[index] ? 'true' : undefined"
                  @ionInput="onNameInput(index)"
                />
                <input
                  v-model="category.backgroundColor"
                  type="color"
                  class="color-input"
                  :aria-label="t('calendar2.color_for', { name: category.name })"
                  @input="debouncedUpdateCategories(index)"
                />
                <icon-button
                  :icon="trashOutline"
                  :label="t('calendar2.delete_category', { name: category.name })"
                  color="danger"
                  @press="askDelete(index)"
                />
              </ion-item>
              <p v-if="nameErrors[index]" class="item-error" role="alert">
                {{ nameErrors[index] }}
              </p>
            </div>
          </ion-list>

          <form class="new-category" novalidate @submit.prevent="addCategory">
            <label class="new-category-label" for="new-category-name">
              {{ t("final2.category_name_label") }}
            </label>
            <ion-item>
              <ion-input
                id="new-category-name"
                v-model="newCategory.name"
                :aria-label="t('final2.category_name_label')"
                :placeholder="t('calendar.category.new_placeholder')"
                autocapitalize="words"
                autocorrect="off"
                enterkeyhint="done"
                :aria-invalid="newCategoryError ? 'true' : undefined"
                @ionInput="newCategoryError = ''"
              />
              <input
                v-model="newCategory.backgroundColor"
                type="color"
                class="color-input"
                :aria-label="t('final2.pick_color')"
                :title="t('final2.pick_color')"
                @input="newCategory.textColor = contrastTextColor(newCategory.backgroundColor)"
              />
            </ion-item>
            <p v-if="newCategoryError" class="item-error" role="alert">{{ newCategoryError }}</p>
            <ion-button type="submit" expand="block" fill="outline">
              {{ t("calendar.category.add_button") }}
            </ion-button>
          </form>
        </section>
      </div>
    </ion-content>
  </ion-modal>

  <confirm-dialog
    :is-open="showResetConfirm"
    :title="t('calendar2.reset_title')"
    :message="t('calendar2.reset_message')"
    :confirm-label="t('calendar2.reset_confirm')"
    @confirm="confirmReset"
    @cancel="showResetConfirm = false"
  />

  <confirm-dialog
    :is-open="pendingDelete !== null"
    :title="t('calendar2.delete_title', { name: pendingDeleteName })"
    :message="t('calendar2.delete_message')"
    :confirm-label="t('modal.delete')"
    danger
    @confirm="confirmDelete"
    @cancel="pendingDelete = null"
  />
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
  IonList,
  IonInput,
  IonButton,
  IonLabel,
  IonIcon,
} from "@ionic/vue";
import { trashOutline, refreshOutline } from "ionicons/icons";
import ModalHeader from "../modal/ModalHeader.vue";
import ConfirmDialog from "../modal/ConfirmDialog.vue";
import IconButton from "../ui/IconButton.vue";
import { useMountWhileOpen } from "../modal/useMountWhileOpen";
import localizationService from "@/services/general/LocalizationService";
import { categoryNameProblem, contrastTextColor } from "@/utils/categoryColors";

import Utils from "@/utils/utils";

const copyCategories = (list: readonly Category[]): Category[] =>
  list.map((category) => ({ ...category }));

const blankCategory = (): Category => ({
  name: "",
  textColor: "#000000",
  backgroundColor: "#FFFFFF",
});

export default defineComponent({
  name: "CalendarSettingsModal",
  components: {
    IonModal,
    IonContent,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonList,
    IonInput,
    IonButton,
    IonLabel,
    IonIcon,
    ModalHeader,
    ConfirmDialog,
    IconButton,
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
  setup(props) {
    return {
      ...useMountWhileOpen(() => props.isOpen),
      trashOutline,
      refreshOutline,
      contrastTextColor,
    };
  },
  data() {
    return {
      localCategories: copyCategories(this.categories),
      localWatering: copyCategories(this.wateringCategories),
      nameErrors: {} as Record<number, string>,
      newCategory: blankCategory(),
      newCategoryError: "",
      showResetConfirm: false,
      pendingDelete: null as number | null,
      debouncedUpdateCategories: (() => undefined) as (index: number) => void,
      debouncedUpdateWateringCategories: (() => undefined) as (index: number) => void,
    };
  },
  created() {
    this.debouncedUpdateCategories = Utils.debounce((index: number) => {
      const category = this.localCategories[index];
      if (!category) return;
      category.textColor = contrastTextColor(category.backgroundColor);
      this.emitCategories();
    }, 300);

    this.debouncedUpdateWateringCategories = Utils.debounce((index: number) => {
      const category = this.localWatering[index];
      if (!category) return;
      category.textColor = contrastTextColor(category.backgroundColor);
      this.$emit("update:wateringCategories", copyCategories(this.localWatering));
    }, 500);
  },
  computed: {
    localizedWeekdays() {
      const base = new Date(2021, 7, 1);
      const fmt = new Intl.DateTimeFormat(localizationService.getLocale(), {
        weekday: "long",
      });
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        return { value: i, label: fmt.format(d) };
      });
    },
    pendingDeleteName(): string {
      return this.pendingDelete === null
        ? ""
        : (this.localCategories[this.pendingDelete]?.name ?? "");
    },
  },
  watch: {
    isOpen(open: boolean) {
      if (open) this.syncFromProps();
    },
    "categories.length"() {
      this.localCategories = copyCategories(this.categories);
      this.nameErrors = {};
    },
    wateringCategories() {
      this.localWatering = copyCategories(this.wateringCategories);
    },
  },
  methods: {
    t(key: string, vars?: Record<string, string>) {
      return localizationService.t(key, vars, key);
    },
    onDidDismiss() {
      this.$emit("close");
      this.release();
    },
    syncFromProps() {
      this.localCategories = copyCategories(this.categories);
      this.localWatering = copyCategories(this.wateringCategories);
      this.nameErrors = {};
      this.newCategory = blankCategory();
      this.newCategoryError = "";
    },
    problemText(problem: "empty" | "duplicate" | null): string {
      if (problem === "empty") return this.t("calendar2.name_required");
      if (problem === "duplicate") return this.t("calendar2.name_taken");
      return "";
    },
    otherNames(index: number): string[] {
      return this.localCategories.filter((_, i) => i !== index).map((c) => c.name);
    },
    emitCategories() {
      if (Object.values(this.nameErrors).some(Boolean)) return;
      this.$emit("update:categories", copyCategories(this.localCategories));
    },
    onNameInput(index: number) {
      const problem = categoryNameProblem(
        this.localCategories[index]?.name ?? "",
        this.otherNames(index),
      );
      this.nameErrors = { ...this.nameErrors, [index]: this.problemText(problem) };
      this.emitCategories();
    },
    addCategory() {
      const problem = categoryNameProblem(
        this.newCategory.name,
        this.localCategories.map((c) => c.name),
      );
      if (problem) {
        this.newCategoryError = this.problemText(problem);
        return;
      }
      this.newCategory.name = this.newCategory.name.trim();
      this.newCategory.textColor = contrastTextColor(this.newCategory.backgroundColor);
      this.$emit("add-category", { ...this.newCategory });
      this.newCategory = blankCategory();
      this.newCategoryError = "";
    },
    askDelete(index: number) {
      this.pendingDelete = index;
    },
    confirmDelete() {
      if (this.pendingDelete !== null) this.$emit("delete-category", this.pendingDelete);
      this.pendingDelete = null;
    },
    confirmReset() {
      this.showResetConfirm = false;
      this.$emit("reset-watering-categories");
    },
  },
});
</script>

<style scoped>
.settings-column {
  display: grid;
  gap: var(--space-4);
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

.settings-card {
  padding: var(--space-3) var(--space-4) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}

.settings-heading {
  font-size: var(--text-md);
}

.settings-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.settings-note {
  margin: var(--space-2) 0 0;
  color: var(--ink-soft);
  font-size: var(--text-xs);
}

.color-input {
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}

.item-error {
  margin: var(--space-1) 0 0;
  color: var(--ion-color-danger);
  font-size: var(--text-xs);
  font-weight: 600;
}

.new-category-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--ion-text-color);
}

.new-category {
  display: grid;
  gap: var(--space-2);
  margin-top: var(--space-3);
}
</style>
