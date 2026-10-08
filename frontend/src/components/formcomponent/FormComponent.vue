<template>
  <div class="form-container">
    <IonCard class="form-card">
      <IonCardHeader>
        <div class="card-head">
          <h2 class="card-title">{{ translateProp(cardTitle) }}</h2>
          <IconButton
            v-if="onDeleteClick"
            :icon="trashBin"
            :label="t('a11y.delete', undefined, 'Delete')"
            color="danger"
            @press="showDeleteModal = true"
          />
        </div>
      </IonCardHeader>
      <IonCardContent v-if="item">
        <form ref="form" novalidate @submit.prevent="submitForm">
          <div v-for="field in formFields" :key="field.modelKey" :data-field="field.modelKey">
            <component
              :is="componentFor(field.type)"
              v-model="item[field.modelKey]"
              :field="field"
              :error="errors[field.modelKey] || ''"
              @blur="touch(field.modelKey)"
              @update:model-value="dismissServerError(field.modelKey)"
            />
          </div>

          <p v-if="submitAttempted && hasErrors" class="form-summary" role="alert">
            {{ t("form2.fix_fields", undefined, "Some fields need your attention.") }}
          </p>

          <IonButton expand="block" color="primary" type="submit" :disabled="isLoading">
            <span v-if="isLoading">{{ t("form.waiting", undefined, "Please wait...") }}</span>
            <ion-spinner v-if="isLoading" name="crescent" />
            <span v-else>{{ translateProp(submitLabel) }}</span>
          </IonButton>
        </form>
      </IonCardContent>
    </IonCard>

    <div
      v-if="extraContentComponent && extraContentData"
      class="extra-content-wrapper align-middle"
    >
      <component :is="extraContentComponent" v-bind="extraContentData" />
    </div>
  </div>

  <ConfirmDialog
    :is-open="showDeleteModal"
    :title="t('modal.delete.title', undefined, 'Delete')"
    :message="deleteSentence"
    :confirm-label="t('modal.delete', undefined, 'Delete')"
    :loading="deletePending"
    danger
    @confirm="submitDelete"
    @cancel="showDeleteModal = false"
  />
</template>

<script lang="ts">
import { defineComponent, PropType, Component } from "vue";
import { IonCard, IonCardHeader, IonCardContent, IonButton, IonSpinner } from "@ionic/vue";
import { trashBin } from "ionicons/icons";

import InputField from "@/components/formcomponent/fields/InputField.vue";
import PasswordField from "@/components/formcomponent/fields/PasswordField.vue";
import SelectField from "@/components/formcomponent/fields/SelectField.vue";
import RadioField from "@/components/formcomponent/fields/RadioField.vue";
import SwitchField from "@/components/formcomponent/fields/SwitchField.vue";
import DateField from "@/components/formcomponent/fields/DateField.vue";
import UploadField from "@/components/formcomponent/fields/UploadField.vue";
import ConfirmDialog from "@/components/modal/ConfirmDialog.vue";
import IconButton from "@/components/ui/IconButton.vue";
import { focusFieldHost } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";
import { hasFormValue } from "@/utils/formState";

const FIELD_COMPONENTS = {
  input: InputField,
  password: PasswordField,
  select: SelectField,
  radio: RadioField,
  date: DateField,
  switch: SwitchField,
  file: UploadField,
} as const;

export default defineComponent({
  name: "FormComponent",
  components: {
    IonCard,
    IonCardHeader,
    IonCardContent,
    IonButton,
    IonSpinner,
    ConfirmDialog,
    IconButton,
  },
  props: {
    item: {
      type: Object as PropType<Record<string, any>>,
      required: true,
    },
    formFields: {
      type: Array as PropType<FormField[]>,
      required: true,
    },
    cardTitle: {
      type: String,
      default: "Form",
    },
    submitLabel: {
      type: String,
      default: "Submit",
    },
    extraContentComponent: {
      type: Object as PropType<any>,
      default: null,
    },
    extraContentData: {
      type: Object as PropType<Record<string, any>>,
      default: () => ({}),
    },
    isLoading: {
      type: Boolean,
      default: false,
    },
    onSubmitClick: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onDeleteClick: {
      type: Function as PropType<() => void | Promise<void>>,
      required: false,
    },
    /** Names the thing being deleted in the confirmation sentence; falls back to item.name. */
    deleteLabel: {
      type: String,
      default: "",
    },
    /** Server-side problems per field (modelKey to message), shown under the field. */
    fieldErrors: {
      type: Object as PropType<Record<string, string>>,
      default: () => ({}),
    },
  },
  data() {
    return {
      showDeleteModal: false,
      deletePending: false,
      submitAttempted: false,
      touched: {} as Record<string, boolean>,
      serverErrors: { ...this.fieldErrors } as Record<string, string>,
    };
  },
  setup() {
    return { trashBin };
  },
  computed: {
    errors(): Record<string, string> {
      const result: Record<string, string> = {};
      for (const field of this.formFields) {
        const key = field.modelKey;
        if (this.serverErrors[key]) {
          result[key] = this.serverErrors[key];
        } else if ((this.submitAttempted || this.touched[key]) && !this.isFieldValid(field)) {
          result[key] = this.requiredMessage(field);
        }
      }
      return result;
    },
    hasErrors(): boolean {
      return Object.keys(this.errors).length > 0;
    },
    deleteSentence(): string {
      const name = this.deleteLabel || this.item?.name;
      return name
        ? this.t("form2.delete_named", { name }, `Delete "${name}"? This cannot be undone.`)
        : this.t("form2.delete_generic", undefined, "Delete this item? This cannot be undone.");
    },
  },
  watch: {
    fieldErrors: {
      deep: true,
      handler(next: Record<string, string>) {
        this.serverErrors = { ...next };
        if (Object.keys(next).length > 0) this.$nextTick(() => this.focusFirstError());
      },
    },
    isLoading(now: boolean) {
      if (!now && this.deletePending) this.finishDelete();
    },
  },
  methods: {
    t(key: string, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key, vars, fallback);
    },
    translateProp(value: string) {
      return this.t(value, undefined, value);
    },
    componentFor(type: FormField["type"]): Component {
      return FIELD_COMPONENTS[type] as Component;
    },
    touch(key: string) {
      this.touched[key] = true;
    },
    dismissServerError(key: string) {
      if (this.serverErrors[key]) delete this.serverErrors[key];
    },
    isFieldValid(field: FormField): boolean {
      if (!field.required) return true;
      const value = this.item[field.modelKey];
      if (field.type === "select" || field.type === "radio") {
        return (field.options as Array<{ value: unknown }>).some(
          (option) => option.value === value,
        );
      }
      if (field.type === "switch") return true;
      return hasFormValue(value);
    },
    requiredMessage(field: FormField): string {
      if (field.type === "select" || field.type === "radio") {
        return this.t("form2.error_choose", undefined, "Please choose an option.");
      }
      if (field.type === "file") {
        return this.t("form2.error_file", undefined, "Please choose a file.");
      }
      return this.t("form2.error_required", undefined, "This field is required.");
    },
    focusFirstError() {
      const first = this.formFields.find((field) => this.errors[field.modelKey]);
      if (!first) return;
      const form = this.$refs.form as HTMLElement | undefined;
      const host = form?.querySelector<HTMLElement>(`[data-field="${first.modelKey}"]`) ?? null;
      focusFieldHost(host);
    },
    submitForm() {
      this.submitAttempted = true;
      const allValid = this.formFields.every((field) => this.isFieldValid(field));
      if (!allValid) {
        this.$nextTick(() => this.focusFirstError());
        return;
      }
      this.onSubmitClick();
    },
    async submitDelete() {
      if (!this.onDeleteClick) return;
      this.deletePending = true;
      try {
        await this.onDeleteClick();
      } catch {
        this.deletePending = false;
        return;
      }
      await this.$nextTick();
      if (!this.isLoading) this.finishDelete();
    },
    finishDelete() {
      this.deletePending = false;
      this.showDeleteModal = false;
    },
  },
});
</script>

<style scoped>
.form-container {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-4);
  box-sizing: border-box;
}

.form-card {
  margin: 0;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.card-title {
  color: var(--ion-text-color);
  font-size: var(--text-lg);
  overflow-wrap: anywhere;
}

.form-summary {
  margin: 0 0 var(--space-3);
  color: var(--ion-color-danger);
  font-weight: 600;
  font-size: var(--text-sm);
}

.extra-content-wrapper {
  width: 100%;
}
</style>
