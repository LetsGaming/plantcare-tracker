<template>
  <FieldShell
    :label="translatedLabel"
    :required="field.required"
    :error="error"
    :hint="translatedHint"
    :message-id="messageId"
    :label-id="labelId"
    @label-click="openSelect"
  >
    <IonSelect
      ref="control"
      v-model="localValue"
      :placeholder="translatedPlaceholder"
      :cancel-text="t('common.cancel')"
      :ok-text="t('copy2.select.ok')"
      :aria-labelledby="labelId"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error || translatedHint ? messageId : undefined"
      @ionBlur="$emit('blur')"
      @ionDismiss="$emit('blur')"
    >
      <IonSelectOption v-for="option in field.options" :key="option.value" :value="option.value">
        {{ t(option.label, undefined, option.label) }}
      </IonSelectOption>
    </IonSelect>
  </FieldShell>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { IonSelect, IonSelectOption } from "@ionic/vue";
import FieldShell from "@/components/formcomponent/FieldShell.vue";
import { fieldErrorProp, nextFieldId } from "@/components/formcomponent/fieldShared";
import localizationService from "@/services/general/LocalizationService";

export default defineComponent({
  name: "SelectFieldComponent",
  emits: ["update:modelValue", "blur"],
  components: { IonSelect, IonSelectOption, FieldShell },
  props: {
    field: {
      type: Object as () => SelectField,
      required: true,
    },
    modelValue: {
      type: [String, Number],
      default: "",
    },
    ...fieldErrorProp,
  },
  data() {
    return { messageId: nextFieldId("field-msg"), labelId: nextFieldId("field-label") };
  },
  computed: {
    translatedLabel(): string {
      return localizationService.t(this.field.label, undefined, this.field.label);
    },
    translatedPlaceholder(): string {
      return localizationService.t(
        this.field.placeholder || "",
        undefined,
        this.field.placeholder || "",
      );
    },
    translatedHint(): string {
      return this.field.hint
        ? localizationService.t(this.field.hint, undefined, this.field.hint)
        : "";
    },
    localValue: {
      get() {
        return this.modelValue;
      },
      set(val: string | number) {
        this.$emit("update:modelValue", val);
      },
    },
  },
  methods: {
    t(key: string | undefined, vars?: Record<string, any>, fallback?: string) {
      return localizationService.t(key || "", vars, fallback || key || "");
    },
    openSelect() {
      const select = (this.$refs.control as { $el?: HTMLElement } | undefined)?.$el;
      select?.click();
    },
  },
});
</script>
